# Stateflow

Stateflow is a touch-first infinite whiteboard with stylus drawing, live desktop viewing, board templates, export/import, and local-first synchronization.

## Local development

Prerequisites: Node.js 22 or newer and PostgreSQL 16 or newer.

1. Install dependencies: `npm install`.
2. Copy `.env.example` to `.env` and configure a PostgreSQL connection.
3. Start the app: `npm run dev`.
4. Configure `STATEFLOW_LOGIN_ID` and `STATEFLOW_LOGIN_PASSWORD` in your local `.env` file. Use a long, unique password.

## Local-first architecture

- Each signed-in device stores its boards and elements in a per-account IndexedDB database.
- Canvas changes and their outbox operations are written in one local transaction.
- A retry-safe HTTP synchronization protocol pushes durable operations to PostgreSQL and pulls ordered changes by cursor.
- WebSocket is used for transient live ink previews, cursor, camera, and presentation events.
- Offline devices keep pending operations locally and retry after connectivity returns.
- The phone is the writing device; desktop remains the read-only live view.

## Render hosting

The recommended hosted setup runs both the Stateflow web service and its dedicated PostgreSQL database in the same Render workspace and Frankfurt region. The web service uses the database's internal connection URL through Render's private network.

See [Render free deployment](deploy/RENDER_FREE.md) for the workspace setup, private single-user login, and free-tier limitations. The checked-in `render.yaml` references the separately provisioned `stateflow-free-db` database; it does not create or modify the HRMS database.

## Offline behavior

A previously signed-in device can continue working from its local IndexedDB data while the network or hosted service is unavailable. New sign-ins and first-time device setup require the backend. Pending changes remain in the device's local outbox and sync when connectivity returns and the service is reachable.

Live ink previews require both devices to be online and connected to the same running Stateflow service. The durable database sync makes completed work available after a device reconnects; it does not require the desktop PC to stay powered on.

## Personal login security

This deployment uses one fixed login ID and password for one personal workspace. The login ID is `owner`; the password is supplied privately through Render Environment settings and is never committed to Git. The server rate-limits failed login attempts and uses an HttpOnly, SameSite session cookie. Anyone who obtains these credentials can access the same boards, so use a long, unique password and do not share it.

## Important migration note

Existing Firestore boards and media are not migrated by this hosting setup. Keep the old Firebase project and its data intact until a migration/import flow is implemented, verified against every board and asset, and tested on phone and desktop.

## Commands

- `npm run lint` — TypeScript check
- `npm run test:sync-diff` — synchronization and local database regression tests
- `npm run build` — production frontend build
