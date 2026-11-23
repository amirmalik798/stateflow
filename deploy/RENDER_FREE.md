# Deploy Stateflow on Render's free tier

This deployment uses a dedicated Render PostgreSQL 18 database and a Render web service. Both are placed in the **StateFlow** workspace and **Frankfurt** region. The database is the resource named `stateflow-free-db`; it is intentionally separate from the HRMS workspace.

## 1. Resources already provisioned

The following database was created in the StateFlow workspace:

- Name: `stateflow-free-db`
- PostgreSQL: 18
- Plan: Free
- Region: Frankfurt
- Database name: `stateflow_free_db`
- Status: Available

The database's free period is temporary. Render's free PostgreSQL databases expire after 30 days; plan an upgrade or export before the expiry date shown in the Render Dashboard. Free databases do not provide the same backup and recovery guarantees as paid databases.

## 2. Create the web service from the Blueprint

The root `render.yaml` defines only the Stateflow web service. It references the already-created database by name using Render's `fromDatabase` connection reference. It does not define a second database.

1. Open the Render Dashboard and ensure the **StateFlow** workspace is selected.
2. Create a Blueprint from this repository and the `feature/render-managed-postgres-hosting` branch while this change is being reviewed.
3. Review the proposed resource plan. It should add one **Free web service** named `stateflow` in Frankfurt. It must reference the existing `stateflow-free-db` database and must not propose another database or any HRMS changes.
4. Approve the plan in Render only after confirming those details.
5. The Docker build runs TypeScript checking, the focused local-first regression tests, and the Vite production build before starting the server.
6. Render's health check should use `/healthz`.

The service gets `DATABASE_URL` from the existing database's internal connection string. `PG_SSL=false` is deliberate: Render's internal same-region connection does not require TLS. Do not paste an external database URL into this service.

## 3. Configure Google OAuth

The Blueprint marks the following settings as manual secrets, so they are not stored in Git:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Set both on the Stateflow web service's **Environment** page in Render. In Google Cloud Console, configure the OAuth 2.0 Web application with:

- Authorized JavaScript origin: the exact HTTPS URL assigned to the Stateflow Render web service.
- Authorized redirect URI: `https://YOUR-STATEFLOW-HOST/api/auth/google/callback`

Replace `YOUR-STATEFLOW-HOST` with the actual Render hostname. Save the Google OAuth changes and redeploy/restart the service after setting the variables. Never commit OAuth credentials or the database URL to Git.

## 4. Verify before using real boards

After the first deployment:

1. Open `https://YOUR-STATEFLOW-HOST/healthz`; expect HTTP 200 and a JSON response with `ok: true`.
2. Confirm the Render service logs report that the PostgreSQL schema is ready.
3. Sign in on the phone and desktop.
4. Create a disposable board on the phone, add several stylus strokes, rename it, and delete another disposable board.
5. Refresh both devices and confirm the durable board state is preserved.
6. With both devices connected, confirm live ink previews and camera/presence behavior still work.
7. Disconnect the phone from the network, make a few edits, refresh, reconnect, and confirm the outbox eventually syncs.
8. Confirm that the database contains only Stateflow test data and that the HRMS database and workspace remain unchanged.

Do not treat a successful image build or health check as proof that sign-in, live relay, or two-device synchronization works. Those require the manual checks above.

## 5. Free-tier constraints

- Render's free PostgreSQL database is temporary (30 days), has limited storage, and does not include paid-tier backup guarantees. The exact expiry is visible on the database page.
- Render free web services spin down after a period without traffic and can take around a minute to wake.
- A sleeping or unavailable web service delays cloud synchronization. Phone edits remain in local IndexedDB and the durable outbox until the service is reachable again.
- Live ink relay is not available while the service is asleep or either device is disconnected.
- Free services and databases can be suspended when workspace free usage limits are reached.

Export important boards and database data regularly. Do not use this temporary free database as the sole copy of irreplaceable work.
