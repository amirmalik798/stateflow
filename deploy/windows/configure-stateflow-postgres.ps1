param(
  [Parameter(Mandatory = $true)]
  [string]$PostgresDataDirectory,

  [string]$PostgresServiceName = "postgresql-x64-18",

  [int]$PostgresPort = 5432,

  [switch]$RestartPostgres
)

$ErrorActionPreference = "Stop"

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw "Run PowerShell as Administrator, then run this script again."
}

$tailscaleCommand = Get-Command tailscale.exe -ErrorAction SilentlyContinue
$tailscaleCli = if ($tailscaleCommand) { $tailscaleCommand.Source } else { Join-Path $env:ProgramFiles "Tailscale\tailscale.exe" }
if (-not (Test-Path -LiteralPath $tailscaleCli)) {
  throw "Tailscale is not installed. Install Tailscale and sign this PC into your tailnet first."
}

$tailscaleService = Get-Service -Name "Tailscale" -ErrorAction SilentlyContinue
if (-not $tailscaleService) {
  throw "The Windows Tailscale service was not found. Install and sign in to Tailscale first."
}
Set-Service -Name "Tailscale" -StartupType Automatic
if ($tailscaleService.Status -ne "Running") {
  Start-Service -Name "Tailscale"
}

$tailnetIp = (& $tailscaleCli ip -4 | Select-Object -First 1).Trim()
if ([string]::IsNullOrWhiteSpace($tailnetIp) -or $tailnetIp -notmatch "^100\.") {
  throw "Tailscale did not return a 100.x tailnet IPv4 address. Check that this PC is signed in and connected."
}

$postgresService = Get-Service -Name $PostgresServiceName -ErrorAction SilentlyContinue
if (-not $postgresService) {
  $found = Get-Service | Where-Object { $_.Name -like "postgresql*" } | Select-Object -ExpandProperty Name
  throw "PostgreSQL service '$PostgresServiceName' was not found. Detected services: $($found -join ', '). Pass the correct -PostgresServiceName."
}

$dataPath = (Resolve-Path -LiteralPath $PostgresDataDirectory).Path
$configPath = Join-Path $dataPath "postgresql.conf"
$hbaPath = Join-Path $dataPath "pg_hba.conf"
if (-not (Test-Path -LiteralPath $configPath) -or -not (Test-Path -LiteralPath $hbaPath)) {
  throw "The supplied data directory must contain postgresql.conf and pg_hba.conf."
}

$encoding = New-Object System.Text.UTF8Encoding -ArgumentList $false
$backupSuffix = Get-Date -Format "yyyyMMdd-HHmmss"
Copy-Item -LiteralPath $configPath -Destination ($configPath + ".stateflow-backup-" + $backupSuffix)
Copy-Item -LiteralPath $hbaPath -Destination ($hbaPath + ".stateflow-backup-" + $backupSuffix)

$managedConfig = @"
# BEGIN STATEFLOW MANAGED SETTINGS
listen_addresses = '*'
password_encryption = 'scram-sha-256'
# END STATEFLOW MANAGED SETTINGS
"@
$configText = [System.IO.File]::ReadAllText($configPath)
$configText = [regex]::Replace($configText, '(?ms)^# BEGIN STATEFLOW MANAGED SETTINGS\r?\n.*?^# END STATEFLOW MANAGED SETTINGS\r?\n?', '')
$configText = $configText.TrimEnd() + [Environment]::NewLine + [Environment]::NewLine + $managedConfig + [Environment]::NewLine
[System.IO.File]::WriteAllText($configPath, $configText, $encoding)

$managedHba = @"
# BEGIN STATEFLOW MANAGED ACCESS
# Tailscale overlay only. The Tailscale grant must restrict the Render node to this PC and TCP $PostgresPort.
host    stateflow    stateflow_sync    100.64.0.0/10    scram-sha-256
# END STATEFLOW MANAGED ACCESS
"@
$hbaText = [System.IO.File]::ReadAllText($hbaPath)
$hbaText = [regex]::Replace($hbaText, '(?ms)^# BEGIN STATEFLOW MANAGED ACCESS\r?\n.*?^# END STATEFLOW MANAGED ACCESS\r?\n?', '')
$hbaText = $managedHba + [Environment]::NewLine + $hbaText
[System.IO.File]::WriteAllText($hbaPath, $hbaText, $encoding)

$firewallRuleName = "Stateflow-PostgreSQL-Tailscale"
$firewallRule = Get-NetFirewallRule -Name $firewallRuleName -ErrorAction SilentlyContinue
if ($firewallRule) {
  Set-NetFirewallRule -Name $firewallRuleName -Enabled True
  Get-NetFirewallAddressFilter -AssociatedNetFirewallRule $firewallRule |
    Set-NetFirewallAddressFilter -RemoteAddress "100.64.0.0/10"
} else {
  New-NetFirewallRule -Name $firewallRuleName -DisplayName "Stateflow PostgreSQL over Tailscale only" -Direction Inbound -Action Allow -Protocol TCP -LocalPort $PostgresPort -RemoteAddress "100.64.0.0/10" -Profile Any | Out-Null
}

Set-Service -Name $PostgresServiceName -StartupType Automatic

Write-Host ""
Write-Host "Stateflow PostgreSQL network configuration has been written." -ForegroundColor Green
Write-Host ("This PC's Tailscale IPv4: " + $tailnetIp)
Write-Host ("PostgreSQL port: " + $PostgresPort)
Write-Host "Windows Firewall rule allows TCP only from the Tailscale CGNAT range 100.64.0.0/10."
Write-Host "The database is not configured for public router port-forwarding. Do not create one."
Write-Host "The Tailscale access policy must further restrict tag:stateflow-render to this PC's Tailscale IP and TCP port."

if ($RestartPostgres) {
  Restart-Service -Name $PostgresServiceName -Force
  Write-Host "PostgreSQL service restarted." -ForegroundColor Green
} elseif ((Get-Service -Name $PostgresServiceName).Status -eq "Stopped") {
  Start-Service -Name $PostgresServiceName
  Write-Host "PostgreSQL service started. The new settings are active." -ForegroundColor Green
} else {
  Write-Host "PostgreSQL is running. Restart it during a safe window to apply the new settings:" -ForegroundColor Yellow
  Write-Host ("Restart-Service -Name '" + $PostgresServiceName + "'")
}

Write-Host ""
Write-Host "Next: create the stateflow database and stateflow_sync login as documented in deploy/LOCAL_POSTGRES_TAILSCALE.md."
