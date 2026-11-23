#!/bin/sh
set -eu

if [ -n "${TAILSCALE_AUTH_KEY:-}" ]; then
  TAILSCALE_SOCKET="${TAILSCALE_SOCKET:-/tmp/tailscaled.sock}"
  TAILSCALE_LOG="/tmp/tailscaled.log"

  echo "Starting Tailscale in userspace networking mode..."
  tailscaled \
    --tun=userspace-networking \
    --state=mem: \
    --socket="$TAILSCALE_SOCKET" \
    --socks5-server=127.0.0.1:1055 \
    >"$TAILSCALE_LOG" 2>&1 &
  TAILSCALED_PID=$!

  socket_ready=0
  attempt=0
  while [ "$attempt" -lt 60 ]; do
    if [ -S "$TAILSCALE_SOCKET" ]; then
      socket_ready=1
      break
    fi
    if ! kill -0 "$TAILSCALED_PID" 2>/dev/null; then
      cat "$TAILSCALE_LOG" >&2 || true
      echo "Tailscale daemon exited before its control socket became ready." >&2
      exit 1
    fi
    attempt=$((attempt + 1))
    sleep 0.5
  done

  if [ "$socket_ready" -ne 1 ]; then
    cat "$TAILSCALE_LOG" >&2 || true
    echo "Timed out waiting for Tailscale to start." >&2
    exit 1
  fi

  tailscale --socket="$TAILSCALE_SOCKET" up \
    --auth-key="$TAILSCALE_AUTH_KEY" \
    --hostname="${TAILSCALE_HOSTNAME:-stateflow-render}" \
    --accept-dns=false \
    --accept-routes=false

  tailscale --socket="$TAILSCALE_SOCKET" status
  echo "Tailscale is connected. Starting Stateflow."
else
  echo "TAILSCALE_AUTH_KEY is not configured. Starting the Stateflow shell without remote database connectivity."
fi

exec npm start
