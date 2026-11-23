# Stateflow: local PostgreSQL over Tailscale

This deployment keeps the PostgreSQL data files on your Windows PC. Render hosts the Stateflow web application only. Render does not host the database.

## How the connection works

1. The phone writes to its own IndexedDB database first. Every completed board change is persisted locally with a durable outbox operation.
2. The Render service runs Tailscale in userspace mode and exposes a SOCKS5 proxy on loopback only.
3. A small TCP forwarder inside the Render container binds to 127.0.0.1:15432 and sends PostgreSQL traffic through that SOCKS5 proxy to the Windows PC's Tailscale IPv4 on TCP 5432.
4. PostgreSQL remains on the Windows PC. No router port-forward and no public PostgreSQL address are required.
5. When the PC is off, phone edits remain queued locally. After the PC and its Tailscale client are online again, the next sync attempt uploads the queue. The desktop then downloads the committed operations.

The local forwarder accepts connections only from the Stateflow server process on the same container. Never expose port 15432 or the Tailscale SOCKS port publicly.

## 1. Prepare PostgreSQL on Windows

Install PostgreSQL and Tailscale on the Windows PC. Sign the PC into the same Tailscale network (tailnet) that the Render service will join.

In an elevated PowerShell window, identify your PostgreSQL service and data directory:

```powershell
Get-Service *postgres*
```

Typical PostgreSQL 18 defaults are:

- Service: `postgresql-x64-18`
- Data directory: `C:\Program Files\PostgreSQL\18\data`

Use your actual version and directory. Create a dedicated role and database from an interactive `psql` session:

```sql
CREATE ROLE stateflow_sync WITH LOGIN;
\password stateflow_sync
CREATE DATABASE stateflow OWNER stateflow_sync;
```

The `\password` command prompts securely instead of putting the plaintext password into shell history. Save the password in a password manager. When building the Render `DATABASE_URL`, URL-encode any reserved characters in the password.

Run the configuration script as Administrator. Replace the service name and directory with the values found above:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\deploy\windows\configure-stateflow-postgres.ps1 -PostgresServiceName "postgresql-x64-18" -PostgresDataDirectory "C:\Program Files\PostgreSQL\18\data" -RestartPostgres
```

The script backs up the PostgreSQL configuration files, enables listening on network interfaces, adds a SCRAM-authenticated rule for the Tailscale address range, creates a Windows Firewall allow rule scoped to Tailscale sources, and enables automatic PostgreSQL service startup.

Important security checks:

- Do not create a router port-forward for TCP 5432.
- Do not add a public IP allow-list entry for PostgreSQL.
- Keep the Windows Firewall inbound default-deny behavior.
- Review existing PostgreSQL firewall rules. Remove or narrow any older rule that allows TCP 5432 from the public internet or an entire untrusted LAN.
- Keep PostgreSQL's `stateflow_sync` account limited to the Stateflow database. Do not use the PostgreSQL superuser in Render.

## 2. Restrict the Tailscale network policy

Get the PC's tailnet IPv4 address:

```powershell
tailscale ip -4
```

In the Tailscale admin console, merge the policy entries from `deploy/tailscale-grants.example.hujson` into your existing policy. Replace `100.XX.XX.XX` with the PC's actual Tailscale IPv4. Do not replace the whole policy file or delete existing grants.

Create an auth key for Render with these properties:

- Tagged as `tag:stateflow-render`.
- Ephemeral, because Render free services can restart and their filesystem is not persistent.
- Reusable, so a new container instance can authenticate after a restart.
- Pre-approved if device approval is enabled for your tailnet.

Store the generated key only as a Render secret. Never commit it to Git, paste it into source files, or put it in client-side code. Revoke the key in Tailscale if it is exposed.

## 3. Deploy Stateflow on Render

Create a new Render **Web Service** for `amirmalik798/stateflow`:

| Setting | Value |
|---|---|
| Branch | `main` |
| Runtime | Docker |
| Dockerfile | `./Dockerfile` |
| Region | Frankfurt |
| Instance plan | Free |
| Health check path | `/healthz` |
| Auto-deploy | Yes |

Do not create a Render PostgreSQL database. The database remains on the Windows PC.

After the Render URL is assigned, set these environment variables on the web service:

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | The exact HTTPS Render URL, e.g. `https://stateflow-xxxx.onrender.com` |
| `TAILSCALE_AUTH_KEY` | The tagged, reusable, ephemeral Tailscale auth key |
| `TAILSCALE_HOSTNAME` | `stateflow-render` |
| `PG_TAILSCALE_TARGET_HOST` | Windows PC's Tailscale IPv4, e.g. `100.XX.XX.XX` |
| `PG_TAILSCALE_TARGET_PORT` | `5432` |
| `PG_TAILSCALE_LOCAL_PORT` | `15432` |
| `PG_TAILSCALE_SOCKS_PORT` | `1055` |
| `DATABASE_URL` | `postgresql://stateflow_sync:URL_ENCODED_PASSWORD@127.0.0.1:15432/stateflow` |
| `PG_POOL_SIZE` | `4` |
| `PG_SSL` | `false` |

Tailscale encrypts traffic between the Render node and the Windows PC. PostgreSQL is not directly exposed to the public internet. The application uses a loopback connection to the local SOCKS forwarder; the forwarder connects to the PC's Tailscale address.

## 4. Configure Google OAuth

Create or update a Google OAuth 2.0 Web application. Add the Render URL as an authorized JavaScript origin and add this exact redirect URI:

```text
https://YOUR-RENDER-HOST/api/auth/google/callback
```

Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` as Render environment variables. Never put OAuth secrets in client code or commit them to Git.

## 5. First sign-in and the PC-off workflow

Sign in on each device at least once while PostgreSQL is reachable. The browser caches the non-secret account profile and stores that device's boards in its own IndexedDB database.

After that:

- The PC can be powered off while you write on a previously signed-in phone.
- The phone saves every completed change locally and keeps the outbox queued.
- New sign-ins and first-time device setup require the server/database to be reachable.
- When the PC is powered on and Tailscale is connected, reopen Stateflow on the phone. It retries synchronization and uploads queued operations.
- Open Stateflow on the desktop. It pulls the committed changes from PostgreSQL.
- No manual merge or file transfer is required for this phone-writer/desktop-viewer workflow.

The app requests persistent browser storage, but browsers can still clear site data or users can clear it manually. Keep regular database backups and export important boards. A local database on one PC is not a substitute for an off-site backup.

## 6. Test before relying on it

Use a disposable test board and verify all of the following:

1. Sign in on phone and desktop while the PC database is online.
2. Confirm the Render health check returns HTTP 200 at `/healthz`.
3. Turn off the PC (or stop PostgreSQL) while leaving phone internet enabled.
4. Create a board, write multiple strokes, rename the board, and delete a disposable test board.
5. Refresh the phone page and confirm locally saved work remains visible.
6. Confirm the sync indicator shows pending/error rather than falsely claiming server persistence.
7. Turn the PC back on; wait for PostgreSQL and Tailscale to connect.
8. Reopen Stateflow on the phone and confirm pending operations are acknowledged.
9. Open the desktop view and confirm the board, strokes, rename, and deletion match the phone.
10. Restart the Render service and repeat a sync to verify ephemeral Tailscale re-authentication.

## Free Render service limitations

- A free web service spins down after 15 minutes without inbound HTTP requests or WebSocket messages. The next request starts it again and can take about a minute.
- The free service has an ephemeral filesystem. Tailscale uses in-memory state and reconnects with its ephemeral auth key after a restart.
- Render grants 750 free instance hours per workspace per month. If the workspace uses all included hours, free web services are suspended until the next month.
- Outbound bandwidth is metered against the workspace's included usage. A local database transfer is outbound traffic from Render.
- Render may restart a free service at any time. The PC and PostgreSQL service must also be running for a successful sync.

This is a staging configuration. The first real database connection, Google OAuth flow, and two-device/offline recovery must be tested before considering it production-ready.
