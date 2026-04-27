# Vet AST App

Veterinary AST case management application built with:

- React + Vite frontend (`client/`)
- Express + TypeScript backend (`server/`)
- SQLite storage via Drizzle + better-sqlite3

This README is the developer + operations guide for future changes and deployments.

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

## Environment Variables

Copy `.env.example` values into your deployment environment:

- `NODE_ENV`: `production` or `development`
- `PORT`: server port
- `DB_PROVIDER`: `sqlite` (current runtime default) or `postgres` (prep mode)
- `DB_FILE`: SQLite file path (set this explicitly in production)
- `DATABASE_URL`: Postgres connection string (required for Postgres checks/migrations)
- `ALLOW_DEFAULT_ADMIN`: allow creating default admin when DB is empty

Important:

- In production, keep `ALLOW_DEFAULT_ADMIN=false` after initial setup.
- Use a stable, persistent volume/location for `DB_FILE`.

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

At startup, server logs the active DB file path.

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

## Deployment Notes (Single Instance)

This app is currently suitable for single-instance deployment with persistent disk.

Recommended:

- pin Node 20 LTS
- mount persistent storage for `DB_FILE`
- run behind reverse proxy (TLS termination)
- monitor `/api/health` and `/api/ready`
- schedule DB backups

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

- Build prints a PostCSS plugin warning (`from` option missing). It does not currently block build, but should be cleaned up in dependency maintenance.
