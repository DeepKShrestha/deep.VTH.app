# Vet AST App - Full Developer Handover Guide

Veterinary AST case management application with:

- React + Vite frontend (`client/`)
- Express + TypeScript backend (`server/`)
- SQLite as default runtime DB (`DB_PROVIDER=sqlite`)
- Postgres support path (in progress, safe for migration/testing commands)

This document is written as a handover manual for developers who were not part of original implementation.

---

## 1) Product Overview

The app supports:

- User signup/login with approval workflow
- Role-based behavior (`superadmin`, `admin`, `staff`, `intern`, `student`, `pending`)
- Case registration and management (including configurable form fields)
- Breakpoint management
- Download request workflow
- Password reset request workflow with approval/rejection
- Admin-side auditability features (notifications, edit logs, reset logs, CSV exports)

---

## 2) First 30 Minutes for a New Developer

Do this in order:

1. Install dependencies:
   - `npm install`
2. Prepare environment:
   - Copy `.env.example` to `.env`
3. Run app:
   - `npm run dev`
4. Run checks once:
   - `npm run test`
   - `npm run check`
5. Understand default auth bootstrap:
   - On empty DB, default admin may be seeded (see `ALLOW_DEFAULT_ADMIN` and runtime conditions below)
6. Explore key UI areas:
   - Login/Signup
   - Admin Panel (Users, Password Resets, Edit Form)
   - Register New Case

---

## 3) Tech Stack and Runtime

### Frontend

- React 18
- Vite
- TypeScript
- TanStack Query
- Radix UI + Tailwind

### Backend

- Express 5
- TypeScript
- Drizzle ORM
- `better-sqlite3` (SQLite path)
- `pg` (Postgres path)

### Tests and Type Safety

- Vitest
- TypeScript compiler (`tsc`) for static checks

---

## 4) Repository Structure

### Core paths

- `client/` - frontend application
- `server/` - API server and bootstrap
- `shared/schema.ts` - schema/types shared by client and server
- `migrations/` - SQLite migrations
- `migrations-pg/` - Postgres migrations
- `docs/` - operational/release runbooks

### Important backend files

- `server/index.ts`
  - App initialization, middleware, health/readiness endpoints, error handling, shutdown behavior
- `server/routes.ts`
  - DB bootstrap/seed logic and route registration
- `server/routes/auth.ts`
  - Signup/login/logout/me/profile/password-reset-request endpoints
- `server/routes/admin.ts`
  - Admin APIs: users, form config, species/breeds, requests, notifications, feature visibility
- `server/routes/cases.ts`
  - Case CRUD and export flows
- `server/routes/context.ts`
  - Auth middleware, role middleware, shared helpers
- `server/auth-session-repo.ts`
  - Auth/session repository abstraction (sqlite/postgres paths)
- `server/storage.ts`
  - DB storage implementation

### Important frontend files

- `client/src/App.tsx` - routing and route protections
- `client/src/lib/auth.tsx` - auth context/session logic
- `client/src/pages/admin.tsx` - main admin panel workflows
- `client/src/pages/register-case.tsx` - case entry form
- `client/src/components/ui/*` - reusable UI primitives

---

## 5) Environment Variables (Authoritative)

Based on `.env.example`:

- `NODE_ENV=development|production`
- `PORT=<number>`
- `DB_PROVIDER=sqlite|postgres`
- `DB_FILE=./data.db` (SQLite DB file path)
- `DATABASE_URL=<postgres-url>` (required for postgres mode/tasks)
- `ALLOW_DEFAULT_ADMIN=true|false`
- `HIDDEN_SUPERADMIN_ENABLED=true|false`
- `HIDDEN_SUPERADMIN_USERNAME=<string>`
- `HIDDEN_SUPERADMIN_EMAIL=<string>`
- `HIDDEN_SUPERADMIN_PASSWORD=<string>`
- `LOG_RESPONSE_BODIES=true|false`

### Production recommendations

- Keep `ALLOW_DEFAULT_ADMIN=false` after initial setup.
- Use persistent volume for `DB_FILE` if SQLite.
- Do not enable `LOG_RESPONSE_BODIES` unless temporary debug is needed.
- If hidden superadmin is enabled, use strong credentials and store secrets safely.

---

## 6) Scripts You Will Use

- `npm run dev` - local dev server
- `npm run test` - run tests
- `npm run check` - TypeScript check
- `npm run build` - production build
- `npm run verify` - test + check + build
- `npm run backup:db` - SQLite backup helper
- `npm run restore:db` - SQLite restore helper
- `npm run check:pg` - Postgres connectivity check
- `npm run smoke:pg:auth` - auth/session smoke test on Postgres
- `npm run db:push:sqlite` - push SQLite schema changes
- `npm run db:push:pg` - push Postgres schema changes

---

## 7) Database and Persistence Model

### Current practical mode

- SQLite is default and stable runtime.

### Key persistence notes

- Data is persisted in DB file (`DB_FILE`) unless file/path changes or data is removed manually.
- Sessions are intentionally cleared at startup (forced re-login after server restart).
- Form builder metadata and custom field definitions are persisted in DB tables.

### Major tables to know

- `users`
- `sessions`
- `cases`
- `breakpoints`
- `download_requests`
- `password_reset_requests`
- `form_sections`
- `form_questions`
- `form_edit_audit_logs`
- `species_options`
- `breed_options`
- `role_feature_visibility`
- `notification_states`

---

## 8) Authentication, Session, and Role Rules

### Auth behavior

- Token stored in browser `sessionStorage`
  - Refresh keeps session
  - Closing tab/window ends session
- Server startup clears sessions by design

### Login identifier handling

- Username/email lookup is trim-safe and case-insensitive in repository layer.

### Default admin bootstrap behavior

When users table is empty:

- Creates default superadmin only if:
  - `NODE_ENV !== production`, or
  - `ALLOW_DEFAULT_ADMIN=true`

When existing users exist:

- If no superadmin exists and `admin` user exists with username `admin`, role may be elevated to superadmin.

### Hidden superadmin behavior

- Optional hidden account can be enabled via env vars.
- Account is hidden from admin user lists.
- Account can be created/updated at startup from env settings.

---

## 9) Admin Panel Capabilities (Current)

### A) Users

- Pending approvals/rejections
- All approved users list
- Search/filter (name, username, email)
- CSV download for filtered user list
- Role change/edit/delete with role-based restrictions

### B) Password Resets

- Approve/reject reset requests
- Resolver note support
- Reset logs toggle in Password Reset tab
- Compact logs table with:
  - full name
  - username
  - decision
  - resolved by
  - AD date/time
  - BS date/time
  - resolver note
- CSV export for reset logs

### C) Form Builder

- Add/move/delete sections
- Add/move/delete custom questions
- Toggle shown/hidden and compulsory/optional
- Species/breed option management
- Form edit audit log

### D) Dashboard Visibility by Role

- Toggle dashboard visibility per role in admin UI
- Persisted in `role_feature_visibility`
- Enforced by UI and backend checks

### E) Notifications

- Admin/superadmin notification center
- Read/delete state stored server-side
- Supports mark-read and delete-read operations

---

## 10) API Endpoint Index (Developer-facing)

### Health

- `GET /api/health`
- `GET /api/ready`

### Auth

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/auth/dashboard-access`
- `PATCH /api/users/me`
- `POST /api/auth/password-reset-requests`

### Admin

- `GET /api/admin/users`
- `GET /api/admin/users/pending`
- `POST /api/admin/users/:id/approve`
- `DELETE /api/admin/users/:id`
- `PATCH /api/admin/users/:id/role`
- `PATCH /api/admin/users/:id`
- `GET /api/admin/download-requests`
- `POST /api/admin/download-requests/:id/resolve`
- `GET /api/admin/password-reset-requests`
- `POST /api/admin/password-reset-requests/:id/resolve`
- `GET /api/admin/feature-visibility/dashboard`
- `PATCH /api/admin/feature-visibility/dashboard/:role`
- `GET /api/admin/form-definition`
- `POST /api/admin/form-sections`
- `PATCH /api/admin/form-sections/:key/move`
- `DELETE /api/admin/form-sections/:key`
- `POST /api/admin/form-questions`
- `PATCH /api/admin/form-questions/:id`
- `PATCH /api/admin/form-questions/:id/move`
- `DELETE /api/admin/form-questions/:id`
- `GET /api/admin/form-edit-logs`
- `GET /api/admin/species-options`
- `POST /api/admin/species-options`
- `DELETE /api/admin/species-options/:id`
- `GET /api/admin/breed-options`
- `POST /api/admin/breed-options`
- `DELETE /api/admin/breed-options/:id`
- `GET /api/admin/notifications/states`
- `PATCH /api/admin/notifications/state`
- `POST /api/admin/notifications/mark-read-all`
- `POST /api/admin/notifications/delete-read`

### Cases / Export / Breakpoints

- Implemented under `server/routes/cases.ts` and `server/routes/breakpoints.ts`
- Refer directly to those files for full endpoint list when extending behavior

---

## 11) Pagination Rules

These endpoints support optional pagination:

- `/api/cases`
- `/api/admin/users`
- `/api/admin/users/pending`
- `/api/admin/download-requests`
- `/api/admin/password-reset-requests`

Query params:

- `page` (1-based)
- `pageSize` (default 50, max 200)
- `paginated=true`

---

## 12) How to Make Changes Safely

### Backend change checklist

1. Put new/changed route in proper domain file under `server/routes/`.
2. Reuse shared middleware from `server/routes/context.ts`.
3. Reuse shared messages from `server/routes/messages.ts` where possible.
4. Ensure role checks exist both where data is read and where actions are performed.
5. Add/update tests in `server/routes/*.test.ts`.
6. Run:
   - `npm run test`
   - `npm run check`

### Frontend change checklist

1. Keep auth/session flows consistent with `client/src/lib/auth.tsx`.
2. Add/update pages in `client/src/pages/`.
3. Register route updates in `client/src/App.tsx`.
4. Reuse `client/src/components/ui/*` primitives.
5. Keep error states visible to user (`toast` or inline message).
6. Run:
   - `npm run test`
   - `npm run check`

### DB/schema change checklist

1. Update `shared/schema.ts`.
2. Update server access points (`auth-session-repo.ts`, `storage.ts`, routes).
3. Add migration in `migrations/` and/or `migrations-pg/`.
4. Preserve compatibility with existing SQLite DB files.
5. Verify bootstrap logic in `server/routes.ts` still works for existing databases.

---

## 13) Deployment Guide (Single Instance Baseline)

Recommended:

- Node.js 20 LTS
- Reverse proxy + TLS termination
- Persistent storage for DB file (if SQLite)
- Health monitoring on:
  - `/api/health`
  - `/api/ready`
- Scheduled backups

### Startup behavior to remember

- Sessions are cleared at startup.
- Hidden superadmin may be created/updated if enabled.

---

## 14) Backup and Restore (SQLite)

- Backup:
  - `npm run backup:db`
- Restore:
  - set `DB_RESTORE_FROM` and run `npm run restore:db`
- Operational recommendation:
  - Daily backups
  - Retain multiple historical backups
  - Prefer backup with app stopped for highest consistency

---

## 15) CI and Release

### CI expectation

- Tests, type-check, and build should pass before merge.

### Pre-release checklist

1. `npm run verify`
2. Validate env vars for target environment
3. Validate backup/restore path
4. Ensure no debug flags left enabled (`LOG_RESPONSE_BODIES`, bootstrap admin setting)
5. Follow `docs/RELEASE.md`

---

## 16) Known Operational Behaviors (Not Bugs)

- Users are logged out after server restart (session table cleared intentionally).
- Closing browser tab logs out user (session token stored in sessionStorage).
- Login accepts username/email with case-insensitive, trim-safe matching.

---

## 17) Troubleshooting

### App fails to start

- Confirm `npm install` succeeded
- Confirm Node version is compatible (Node 20 LTS recommended)
- Check env values (`DB_PROVIDER`, `DB_FILE`, `DATABASE_URL`)

### `/api/ready` fails

- SQLite: verify file path exists and is writable
- Postgres: verify `DATABASE_URL`, network, and credentials

### Can't log in

- Confirm account is approved
- Confirm password is correct
- Check hidden superadmin env values if using hidden account

### Admin actions failing with 403

- Check role restrictions in `server/routes/admin.ts`
- Some actions are superadmin-only by design

---

## 18) Documentation Map

- Release process: `docs/RELEASE.md`
- Operations/incident notes: `docs/OPERATIONS.md`
- This file (`README.md`) is the primary development handover document.

---

## 19) Maintainer Notes

- Keep this README updated when:
  - adding new endpoint groups
  - changing role permissions
  - changing session/auth behavior
  - changing DB bootstrap/seeding logic
- For any new admin workflow, include:
  - who can access it
  - whether it is audited
  - whether data can be exported (CSV/report)
