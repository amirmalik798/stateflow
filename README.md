# Stateflow

Stateflow is a touch-first infinite whiteboard with stylus drawing, live desktop viewing, board templates, export/import, and local-first synchronization.

## Local development

Prerequisites: Node.js 22 or newer and PostgreSQL 16 or newer.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and configure a local PostgreSQL connection.
3. Start the app: `npm run dev`.
4. For Google sign-in, register `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI and configure the OAuth variables.

## Local-first architecture

- Each signed-in device stores its boards and elements in a per-account IndexedDB database.
- Canvas changes and their outbox operations are written in one local transaction.
- A retry-safe HTTP synchronization protocol pushes durable operations to PostgreSQL and pulls ordered changes by cursor.
- WebSocket is used for transient live ink previews, cursor, camera, and presentation events.
- Offline devices keep pending operations locally and retry after connectivity returns.
- The phone is the writing device; desktop remains the read-only live view.

## Hosting with PostgreSQL on a local Windows PC

The Render service can run the Stateflow web application while PostgreSQL stays on your own Windows PC. The Render container connects through Tailscale userspace networking and a loopback-only SOCKS5-to-TCP forwarder.

See [Local PostgreSQL over Tailscale](deploy/LOCAL_POSTGRES_TAILSCALE.md) for Windows configuration, Tailscale least-privilege access, Render variables, Google OAuth, and the offline test plan.

**Do not expose PostgreSQL publicly or create a router port-forward for port 5432.** Tailscale should be the only remote route to PostgreSQL.

## Offline behavior

A previously signed-in device can open its locally cached account profile and IndexedDB boards if the PC/database is unavailable. Changes remain in the local outbox until the Render service can reach the PC database again. A new sign-in or first-time device setup still requires the database to be reachable.

## Important migration note

Existing Firestore boards and media are not migrated by this branch. Keep the old Firebase project and its data intact until a migration/import flow is implemented, verified against every board and asset, and tested on phone and desktop.

## Commands

- `npm run lint` — TypeScript check
- `npm run test:sync-diff` — synchronization and local database regression tests
- `npm run build` — production frontend build

## Render free staging limitations

The free web service sleeps after 15 minutes without incoming HTTP requests or WebSocket messages, then takes about a minute to wake. It has an ephemeral filesystem and 750 included instance hours per workspace per month. Tailscale therefore uses in-memory state and an ephemeral auth key that re-authenticates on container restart. See the staging guide for the complete limitations.
