# Vet AST App

Veterinary AST case management application built with:

- React + Vite frontend (`client/`)
- Express + TypeScript backend (`server/`)
- SQLite storage via Drizzle + better-sqlite3

This README is the developer + operations guide for future changes and deployments.

## Quick Start (5 Minutes)

1. Install dependencies: `npm install`
2. Start app locally: `npm run dev`
3. Open app in browser (default local URL from terminal output)
4. Run quality checks before changes are merged:
   - `npm run test`
   - `npm run check`
   - `npm run build`
5. Use `npm run verify` to run the standard full check sequence.

## Architecture

- `client/`: UI pages, components, and client auth/session bootstrap.
- `server/`: API entrypoint, security middleware, health endpoints, bootstrap.
- `server/routes/`: route modules grouped by domain:
  - `auth.ts`: auth + profile update
  - `admin.ts`: user/admin management
  - `cases.ts`: case CRUD + exports + student requests
  - `breakpoints.ts`: breakpoint CRUD + reset
  - `context.ts`: shared middleware + session/token handling
  - `messages.ts`: shared API response messages
  - `types.ts`: shared request typings
  - `cases-export.ts`: pure export formatting helpers
- `shared/`: schema/types shared by client and server.

## Local Development

- Install dependencies: `npm install`
- Run development server: `npm run dev`
- Run tests: `npm run test`
- Run type-check: `npm run check`
- Build production bundle: `npm run build`
- Run all verification in sequence: `npm run verify`

## Common Developer Tasks

- Configure Register New Case form from Admin UI:
  - Open Admin Panel -> `Edit Form`
  - Use **Register Form Layout (Sections & Questions)** to:
    - add new sections
    - add custom questions inside sections (`text`, `long text`, `number`, `singleSelect`, `multiSelect`, `yesNo`, `date`)
    - move sections/questions up or down
  - Use **Edit Existing Register Form Fields** for built-in questions:
    - set `Shown/Hidden`
    - set `Compulsory/Optional`
  - Use **Species** and **Breeds by Species** cards to manage dropdown options
  - Form edit audit log is hidden by default; open it with the toggle button at the bottom
  - Register page now supports:
    - age value + inline unit selector (`years` / `months`)
    - quick-register mode for mobile/tablet
    - hide optional fields toggle (shows only compulsory fields)
    - compulsory marker (`*`) + save validation strictly follow Admin form `required` settings
    - text normalization:
      - title case for names/labels (e.g. owner name)
      - sentence case for remarks
    - on successful save, redirect to homepage
  - Recent responsive hardening (phone/tablet-safe without desktop regressions):
    - Admin Panel: tab row scroll + stacked action controls to avoid overlap
    - Dashboard: horizontally scrollable sticky filter bar + mobile-safe KPI grids
    - Breakpoints: mobile-safe header actions + scrollable add/edit dialog
    - Case list/view/export/print/register: stacked button rows and wrapped metadata on narrow screens

- Add a new backend endpoint:
  - Add route in the relevant file under `server/routes/`
  - Reuse shared middleware from `server/routes/context.ts`
  - Reuse API messages from `server/routes/messages.ts` when possible
  - Add/adjust tests in `server/routes/*.test.ts`

- Add a new frontend page:
  - Create page in `client/src/pages/`
  - Register route in `client/src/App.tsx`
  - Use existing UI primitives from `client/src/components/ui/`

- Add or update DB columns:
  - Update schema in `shared/schema.ts`
  - Add non-destructive migration SQL under `migrations/` (and `migrations-pg/` if needed)
  - Keep compatibility for existing SQLite data

- Add role/permission logic:
  - Keep role checks centralized in `server/routes/context.ts`
  - Verify both backend authorization and frontend visibility behavior

- Control dashboard access by role:
  - Open Admin Panel -> `Edit Form` -> **Dashboard Visibility by Role**
  - Toggle each role between `Shown` and `Hidden`:
    - `superadmin`
    - `admin`
    - `staff`
    - `intern`
    - `student`
    - `pending`
  - Changes apply immediately and persist in DB table `role_feature_visibility`
  - If a role is hidden:
    - Dashboard button is hidden in UI
    - `/dashboard` route redirects away
    - `/api/dashboard/summary` returns `403`
  - Admin and superadmin can hide dashboard for their own roles too

- Notification center for admins/superadmins:
  - Home screen bell icon shows pending:
    - password reset requests
    - download requests
    - recent form changes (last 24h)
  - Clicking a notification opens the matching Admin tab
  - Supports:
    - mark read (single)
    - mark all read
    - delete read (single/all)
  - Read/delete state is server-backed and shared across admins/superadmins
  - Includes compact popover layout with per-item delete and bulk delete-read actions

## Environment Variables

Copy `.env.example` values into your deployment environment:

- `NODE_ENV`: `production` or `development`
- `PORT`: server port
- `DB_PROVIDER`: `sqlite` (current runtime default) or `postgres` (prep mode)
- `DB_FILE`: SQLite file path (set this explicitly in production)
- `DATABASE_URL`: Postgres connection string (required for Postgres checks/migrations)
- `ALLOW_DEFAULT_ADMIN`: allow creating default admin when DB is empty
- `LOG_RESPONSE_BODIES`: include JSON API response payloads in logs (`true`/`false`)
- `HIDDEN_SUPERADMIN_ENABLED`: optional hidden emergency superadmin account
- `HIDDEN_SUPERADMIN_USERNAME`: login username for hidden superadmin
- `HIDDEN_SUPERADMIN_EMAIL`: login email for hidden superadmin
- `HIDDEN_SUPERADMIN_PASSWORD`: login password for hidden superadmin

Important:

- In production, keep `ALLOW_DEFAULT_ADMIN=false` after initial setup.
- Use a stable, persistent volume/location for `DB_FILE`.
- If `HIDDEN_SUPERADMIN_ENABLED=true`, set a strong unique password and keep credentials offline.

Hidden superadmin deployment note:

- Local `.env` is not used automatically by hosted servers.
- For Railway/DigitalOcean/other official deployments, set hidden superadmin values in the platform environment variables and restart/redeploy.
- The hidden account is seeded/updated on startup from those server env vars.

## SQLite/Postgres Dual-Mode Prep

Current runtime is stable on SQLite and remains the default for localhost.
Postgres prep is included safely for migration and connectivity workflows.
Auth/session repository now includes a Postgres implementation for the first
migration slice, but app runtime remains blocked for `DB_PROVIDER=postgres`
until remaining storage slices are migrated.

- SQLite runtime:
  - `npm run dev`
  - `npm run db:push:sqlite`
- Postgres prep checks:
  - Set `DATABASE_URL`
  - `npm run check:pg`
  - `npm run smoke:pg:auth`
  - `npm run db:push:pg`

This lets you test schema/migration and connectivity for Postgres without risking existing SQLite-based local flow.

## Data Persistence

Cases, users, breakpoints, and sessions are persisted in SQLite (`DB_FILE`).
Data is not removed on restart unless:

- DB file/path changes
- DB file is manually deleted
- delete/reset API actions are called

Exception (intentional behavior):

- Sessions are intentionally cleared at server startup, so all users must log in again after a restart.
- Register form configuration is persisted in DB tables:
  - `form_sections`
  - `form_questions`
  - `form_edit_audit_logs`
  - `species_options`
  - `breed_options`
- Custom answers from admin-added questions are stored per case in `cases.custom_fields`.

At startup, server logs the active DB file path.

## Register Form Builder APIs

The register form is now server-driven by section/question metadata.

- Admin configuration APIs:
  - `GET /api/admin/form-definition`
  - `POST /api/admin/form-sections`
  - `PATCH /api/admin/form-sections/:key/move`
  - `POST /api/admin/form-questions`
  - `PATCH /api/admin/form-questions/:id`
  - `PATCH /api/admin/form-questions/:id/move`
- Register-screen read API:
  - `GET /api/form-definition`
- Species/breed option APIs:
  - `GET /api/admin/species-options`, `POST /api/admin/species-options`, `DELETE /api/admin/species-options/:id`
  - `GET /api/admin/breed-options`, `POST /api/admin/breed-options`, `DELETE /api/admin/breed-options/:id`
  - `GET /api/species-options`, `GET /api/breed-options?species=...`

## Session Behavior

- Auth token is stored in `sessionStorage` (not `localStorage`):
  - page reload keeps login in the same tab
  - closing the tab/window logs user out
- Users can set inactivity auto-logout timeout from Profile:
  - `1 min`, `3 min`, `5 min`, `10 min`, `30 min`
  - `Never` is available only for `admin` and `superadmin`
- When auto-logout happens, login page shows a subtle message:
  - "Logged out due to inactivity"
- Profile QoL:
  - password show/hide toggles for current/new/confirm password
  - password strength meter for new password
  - optional "Ask before logout" setting
- Auth page QoL:
  - login password show/hide toggle
  - signup password + confirm show/hide toggles
  - signup password strength meter
- Server restart policy:
  - all existing sessions are invalidated at startup

## Dashboard Access Control

Dashboard access is role-controlled and configurable from the Admin UI.

- Where to configure:
  - Admin Panel -> `Edit Form` tab -> **Dashboard Visibility by Role**
- Who can configure:
  - `superadmin` and `admin`
- Persistence:
  - Stored in table `role_feature_visibility`
- Enforcement:
  - Frontend hides Dashboard action when role is disabled
  - Frontend route guard blocks `/dashboard`
  - Backend guard blocks analytics endpoint with `403`
- Current-user behavior:
  - If a user disables dashboard for their own role, access is removed immediately
  - Admin Panel visibility card is compact and responsive for dense layouts

## Save-and-Return Behavior

- After successful **Register New Case** save, user is redirected to homepage (`/`).
- After successful **Profile** save, user is redirected to homepage (`/`).

## Health and Readiness

- `GET /api/health`: process liveness, uptime, timestamp
- `GET /api/ready`: DB readiness check (`SELECT 1`)

Use these endpoints for load balancer checks and monitoring.

## Security Baseline

- `helmet` for secure HTTP headers
- API rate limiting via `express-rate-limit`
- Request body size limit for JSON payloads
- Server-side session storage with expiry
- Cryptographically secure token generation
- Request ID propagation via `x-request-id`
- Structured JSON API/error logs (with optional response-body logging)

## API Pagination

To reduce payload size on large datasets, these endpoints support optional pagination:

- `GET /api/cases`
- `GET /api/admin/users`
- `GET /api/admin/users/pending`
- `GET /api/admin/download-requests`
- `GET /api/admin/password-reset-requests`

Query params:

- `page` (1-based)
- `pageSize` (default 50, max 200)
- `paginated=true` (forces paginated response envelope)

## CI

GitHub Actions workflow added at `.github/workflows/ci.yml`:

- install dependencies
- run tests
- run type-check
- run build

All pull requests should pass CI before merge.

## Runbooks

- Release process: `docs/RELEASE.md`
- Operations and incident basics: `docs/OPERATIONS.md`

## Release Checklist (Quick Link)

Before shipping:

1. `npm run verify` passes locally
2. Environment variables are set correctly for target environment
3. Backup/restore commands are verified for current DB mode
4. CI passes on GitHub
5. Follow final release steps in `docs/RELEASE.md`

## Deployment Notes (Single Instance)

This app is currently suitable for single-instance deployment with persistent disk.

Recommended:

- pin Node 20 LTS
- mount persistent storage for `DB_FILE`
- run behind reverse proxy (TLS termination)
- monitor `/api/health` and `/api/ready`
- schedule DB backups

Official server baseline:

- Prefer managed Postgres for long-term production data durability and backup/restore workflows.
- Do not rely on ephemeral filesystem SQLite for official deployment.
- `npm start` no longer hard-forces SQLite; production provider is now controlled by environment variables.

Server runtime hardening included:

- `trust proxy` enabled for reverse-proxy deployments
- API rate-limit response standardization
- HTTP server timeouts configured:
  - `requestTimeout=120s`
  - `headersTimeout=65s`
  - `keepAliveTimeout=60s`
- graceful shutdown on `SIGTERM`/`SIGINT` with close timeout guard
- startup warning if `ALLOW_DEFAULT_ADMIN=true` in production
- process-level handlers for `unhandledRejection` and `uncaughtException`

## Backup Strategy (SQLite)

- Backup command: `npm run backup:db`
- Restore command:
  - `cross-env DB_FILE=./data.db DB_RESTORE_FROM=./backups/<file>.db npm run restore:db`
- Minimum: daily backup + retain at least 7–14 copies
- Prefer backups with app stopped for highest consistency

## Change Management Guide

When editing backend behavior:

1. Keep route logic in domain files under `server/routes/`.
2. Put shared middleware and auth/session logic in `context.ts`.
3. Reuse message constants from `messages.ts`.
4. Prefer pure helper modules for transform/business logic (testable).
5. Add/adjust tests in `server/routes/*.test.ts`.

When editing frontend behavior:

1. Keep auth bootstrap flow intact (`client/src/lib/auth.tsx`).
2. Use `apiRequest()` or explicit fetch with error handling.
3. Preserve protected-route behavior in `client/src/App.tsx`.

## Production Hardening Roadmap (Next)

For mass-scale multi-instance use, prioritize:

1. Move from SQLite to managed Postgres
2. Move sessions to shared store (DB-backed table is already a bridge)
3. Add structured logging and centralized monitoring
4. Add audit logging for critical actions
5. Add disaster recovery runbook

## Known Warnings

- Bundle-size warning (`>500kb`) has been addressed with Vite chunk splitting.
- PostCSS `from` warning is non-blocking and filtered from build logs in `script/build.ts` for clean CI/build output.

## Troubleshooting

- Blank page in development:
  - Ensure `NODE_ENV=development` for local run
  - Confirm server is running and check browser console/network tab

- Unexpected logout:
  - Closing tab/window logs out by design (`sessionStorage`)
  - Server restart invalidates all sessions by design
  - Inactivity timeout may auto-logout users based on profile setting

- `/api/ready` returns non-ready:
  - Verify DB path (`DB_FILE`) exists and is writable
  - Check startup logs for database path and error details

- Deployed domain not active:
  - Verify DNS records match host provider instructions exactly
  - Wait for propagation and SSL issuance to complete
