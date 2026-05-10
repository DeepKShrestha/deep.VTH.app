# Vet AST App - Developer Handover Guide

This project is a veterinary teaching hospital application with two primary modules:

- **VTH Case Registration** (hospital cases)
- **AST Report Module** (AST-focused workflow)

This README is a practical handover for the next developer to maintain and extend the app safely.

---

## 1) Quick Start

**Prerequisites**

- **Node.js 20.x** and npm (matches `.github/workflows/ci.yml` and the repo’s TypeScript tooling).
- On Windows, use a normal shell (PowerShell or cmd); native addons such as `better-sqlite3` may need `npm rebuild better-sqlite3` after Node upgrades (see §22).

**First clone**

1. Copy environment template (optional but recommended for local overrides): create `.env` from `.env.example`. The dev script sets SQLite defaults via `cross-env`, but the server still loads `.env` via `dotenv` (`server/index.ts`).
2. Install dependencies: `npm install`
3. Run locally: `npm run dev`
4. Open: `http://localhost:5001/#/`
5. Validate baseline: `npm run test`, `npm run check`, `npm run build`

**First login (empty database)**

- If there are **no users** yet (new `DB_FILE`), startup creates a **development bootstrap superadmin** in `server/routes.ts`: username `admin`, password `admin123`. This path runs when `NODE_ENV` is not `production`, or when `ALLOW_DEFAULT_ADMIN=true` in production (discouraged after go-live; see `server/index.ts` warning).
- Rotate or replace this account before any shared, staging, or production environment.

Recommended before any merge:

- `npm run verify` (same gates as CI: test + typecheck + build)

---

## 2) Stack and Runtime

### Frontend
- React 18 + TypeScript + Vite
- Wouter (hash routing)
- TanStack Query
- Radix + Tailwind UI components

### Backend
- Express 5 + TypeScript
- Drizzle ORM
- SQLite default runtime (`better-sqlite3`)
- Optional Postgres path (`pg`)

### Important runtime detail
- App runs by default on **port 5001** in local dev (`npm run dev`).

### Optional desktop shell
- The repo includes an **Electron** entry (`npm run app` in `package.json`). Day-to-day development and deployment are centered on the **web app** (`npm run dev` / production Node). Treat Electron as optional unless your team actively ships that target.

---

## 3) Project Layout

### Top-level
- `client/` - frontend app
- `server/` - backend/API
- `shared/schema.ts` - shared DB/type model
- `docs/` - release and operations notes
- `migrations/`, `migrations-pg/` - migration history

### Backend core
- `server/index.ts` - app boot, middleware, health/ready, error handling
- `server/routes.ts` - DB bootstrap + seed + route registration
- `server/routes/auth.ts` - login/signup/me/logout/profile/password-reset requests
- `server/routes/admin.ts` - admin APIs, form-definition APIs, users, downloads, resets
- `server/routes/cases.ts` - case APIs, form-definition read, export/download paths
- `server/routes/context.ts` - auth middleware + capabilities + permission guards
- `server/auth-session-repo.ts` - auth/session data access abstraction

### Frontend core
- `client/src/App.tsx` - route wiring and protected routes
- `client/src/lib/auth.tsx` - auth context, role/capability helpers, session preferences
- `client/src/pages/welcome.tsx` - app home
- `client/src/pages/new-case-home.tsx` - VTH module home
- `client/src/pages/ast-report-home.tsx` - AST module home
- `client/src/pages/ast-settings.tsx` - AST settings page
- `client/src/pages/hospital-form-editor.tsx` - VTH form editor
- `client/src/pages/ast-form-editor.tsx` + `client/src/pages/admin.tsx` (`form-only` mode) - AST form editor
- `client/src/pages/register-case.tsx` - registration form for both scopes (hospital/ast)
- `client/src/pages/case-list.tsx` / `client/src/pages/case-view.tsx` - history + detail
- `client/src/pages/profile.tsx` - profile/security/session screen

---

## 4) Module Boundaries (Critical)

The app has strict form separation by scope:

- Hospital scope: `scope=hospital`
- AST scope: `scope=ast`

Form-related tables include `form_scope`:
- `form_sections.form_scope`
- `form_questions.form_scope`

APIs support scope filtering:
- Admin form endpoints in `server/routes/admin.ts`
- Public form-definition endpoint in `server/routes/cases.ts`

If you add or edit form fields/sections, always ensure:
1. correct scope is sent from frontend
2. backend applies scope filter for reads/writes
3. no cross-scope leakage in queries

---

## 5) Routing Map (Frontend)

Defined in `client/src/App.tsx`.

Main routes:
- `/` - welcome
- `/new-case` - VTH home
- `/new-case/register` - hospital registration
- `/new-case/form-editor` - hospital form editor
- `/new-case/cases` - hospital case history
- `/new-case/cases/:id` - hospital case detail (strict namespace)
- `/new-case/print/:id` - hospital print preview (strict namespace)
- `/ast-report` - AST home
- `/ast-report/settings` - AST settings
- `/ast-report/form-editor` - AST form editor (admin only)
- `/ast-report/cases` - AST case history
- `/ast-report/cases/:id` - AST case detail (strict namespace)
- `/ast-report/print/:id` - AST print preview (strict namespace)
- `/register` - AST registration (permission-gated)
- `/breakpoints` - breakpoints admin
- `/admin` and `/admin/downloads` - admin panel
- `/profile` - account/profile page

Legacy compatibility redirects:
- `/cases` -> `/ast-report/cases`
- `/cases/:id` -> `/ast-report/cases`
- `/print/:id` -> `/ast-report/cases`

---

## 6) Permissions and Roles

Role model:
- `superadmin`, `admin`, `staff`, `intern`, `student`, `pending`

Capability resolution is in:
- `server/routes/context.ts` (`resolveCapabilitiesForRole`)
- mirrored fallback logic in `client/src/lib/auth.tsx`

Main capabilities:
- `hospital.case.create`
- `hospital.case.view`
- `ast.case.create`
- `ast.case.view`
- `ast.download`
- `ast.admin`

When changing permission behavior:
1. update backend capability mapping first
2. update frontend fallback mapping second
3. validate route guards in `App.tsx`
4. test student/intern/staff/admin flows

---

## 7) Form System: Where to Edit What

### Registration behavior
- `client/src/pages/register-case.tsx`
  - dynamic section/question rendering
  - bullet mode handling
  - avian conditional fields
  - custom field normalization on submit
  - scope-aware API usage

### Hospital form editor behavior
- `client/src/pages/hospital-form-editor.tsx`
  - section/question layout editing
  - built-in toggles (shown/required)
  - species + breeds catalog editing

### AST form editor behavior
- `client/src/pages/admin.tsx` with `mode="form-only"` and AST filters
- `client/src/pages/ast-form-editor.tsx` wrapper route page

### Backend form-definition and mutations
- `server/routes/admin.ts` (admin form CRUD)
- `server/routes/cases.ts` (`/api/form-definition`)
- `server/routes.ts` bootstrap seeds and default built-ins

---

## 8) Built-in Field Sync Rule (Important)

If you add a new built-in form field/section (example: Clinical Signs and Symptoms), update all relevant layers:

1. `register-case.tsx` (render + submit normalization + required checks)
2. Hospital editor (`hospital-form-editor.tsx`) so admin can see/manage it
3. Bootstrap seeds in `server/routes.ts` for long-term DB consistency
4. Built-in detection helpers (if used for non-deletable/non-custom logic)
5. Scope classification/migrations if hospital-only or ast-only

Failure to update all layers causes "shows in register but not in editor" type mismatches.

---

## 9) Authentication and Sessions

Frontend token persistence:
- token stored in `localStorage` (with sessionStorage compatibility read)
- implemented in `client/src/lib/auth.tsx`

Backend sessions:
- table: `sessions`
- startup currently clears all sessions in `server/routes.ts`
  - users re-login after server restart (expected behavior)

New endpoint:
- `POST /api/auth/logout-all-sessions` (current user only)

---

## 10) Profile Page Notes

Profile implementation:
- `client/src/pages/profile.tsx`

Current features include:
- card-based layout (Account, Security, Session Preferences, Role & Permissions)
- change password accordion with inline validation
- sticky save bar with unsaved/saved state
- logout-all-sessions confirmation
- password reset request action

Backend profile endpoints:
- `PATCH /api/users/me`
- `POST /api/auth/password-reset-requests`
- `POST /api/auth/logout-all-sessions`

---

## 11) Database Tables You Will Touch Most

- `users`
- `sessions`
- `cases`
- `form_sections`
- `form_questions`
- `form_edit_audit_logs`
- `breakpoints`
- `download_requests`
- `password_reset_requests`
- `species_options`
- `breed_options`

Schema source:
- `shared/schema.ts`

Bootstrap + seed source:
- `server/routes.ts`

---

## 12) Operational Commands

Core:
- `npm run dev`
- `npm run test`
- `npm run check`
- `npm run build`
- `npm run verify`

Tests (Vitest):

- One-shot: `npm run test`
- Watch mode while editing: `npx vitest`
- Route and integration tests use `*.test.ts` under `server/` (see §23 for recently added suites).

DB helpers:
- `npm run backup:db`
- `npm run restore:db`
- `npm run db:push:sqlite`
- `npm run db:push:pg`

Postgres checks:
- `npm run check:pg`
- `npm run smoke:pg:auth`

Production process:
- `npm run build` then `npm run start` (or `npm run start:sqlite` for SQLite-only prod)
- Pre-release checklist: `docs/RELEASE.md` and `docs/OPERATIONS.md`

Site backup / restore (SQLite smoke, optional):
- `npx tsx script/smoke-backup-restore.ts` — copies `./data.db` to a temp tree, runs backup + restore checks (requires an existing dev `data.db`).

---

## 12a) Production deployment (summary)

The app is designed to run as a **single Node process** behind a reverse proxy (nginx, Caddy, or a PaaS edge) that terminates **TLS**. The server sets `trust proxy` for correct client IP behavior behind one proxy hop.

**Typical single-VM layout**

1. Set environment variables (start from `.env.example`); use **absolute paths** for `DB_FILE`, `CASE_ATTACHMENTS_DIR`, and `BACKUP_LOCAL_DIR` in production.
2. `npm ci` (or `npm install`), then `npm run verify`, then `npm run build`.
3. Run `npm run start` under a process manager (systemd, PM2, or your platform’s supervisor).
4. Point the reverse proxy at `PORT` (default in `.env.example` is `5000`; dev uses `5001` in `npm run dev`).
5. Validate `GET /api/health` and `GET /api/ready` after deploy.

**Database choice**

- **SQLite** — acceptable for a **single instance** with file backups; see `npm run backup:db` / `restore:db` and superadmin **full-site** backup below.
- **Postgres** — use when you need **multiple app instances**, managed backups, or stricter operational defaults (`DB_PROVIDER=postgres`, `DATABASE_URL`, migrations under `migrations-pg/`). Postgres **site backup** expects `pg_dump` / `psql` on the server `PATH` or set `PG_BIN` to the PostgreSQL `bin` directory.

**Full-site backup (superadmin)**

- UI: Admin panel → **Backup** tab (superadmin only): run backup, download zips, settings (scheduled backup, retention, optional S3 upload), restore (requires typing the confirmation phrase exactly: `RESTORE_SITE_DATA`).
- Optional S3 upload: set `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (see `server/services/backup-remote.ts`).
- There is **no Dockerfile** in this repo; add one or use your host’s standard Node deployment pattern if you need containerized releases.

---

## 12b) Continuous integration

- Workflow: `.github/workflows/ci.yml`
- On push to `main`/`master` and on pull requests: `npm ci`, then `npm run test`, `npm run check`, `npm run build` (align local work with `npm run verify`).

---

## 13) API Surface (High-level)

### Health
- `GET /api/health`
- `GET /api/ready`

### Auth/Profile
- `POST /api/auth/signup`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `POST /api/auth/logout-all-sessions`
- `GET /api/auth/me`
- `PATCH /api/users/me`
- `POST /api/auth/password-reset-requests`

### Admin
- users, roles, approvals
- form sections/questions
- edit logs
- species/breeds
- download requests
- password reset requests
- dashboard visibility settings
- site backup / restore (`/api/admin/backup/*`, superadmin only)

### Cases
- case CRUD/history/view/export
- form-definition fetch (`scope`-aware)

---

## 14) Safe Change Workflow

When implementing any feature:

1. Identify all touchpoints (page + route + schema + permission + editor)
2. Make minimal changes per layer
3. Run:
   - `npm run check`
   - `npm run test`
   - `npm run build`
4. Manually verify key paths:
   - hospital register + editor
   - AST register/history/settings
   - student and admin role behavior

---

## 15) Common Gotchas

- **Scope leakage:** forgetting `scope` query/body on form APIs causes AST/Hospital crossover.
- **Built-in mismatch:** adding field in registration but not editor and seeds.
- **Role drift:** backend capability changes without frontend fallback updates.
- **Session confusion:** server restart clears sessions by design.
- **Route guard mismatch:** check both `App.tsx` and backend middleware.

---

## 16) Environment Variables

Variables used across the server, backup/restore, and scripts. **`.env.example` is the canonical template** (required and common optional keys, commented). Copy it to `.env` and uncomment or set values as needed.

- `NODE_ENV`
- `PORT`
- `DB_PROVIDER=sqlite|postgres`
- `DB_FILE`
- `DATABASE_URL`
- `ALLOW_DEFAULT_ADMIN`
- `HIDDEN_SUPERADMIN_ENABLED`
- `HIDDEN_SUPERADMIN_USERNAME`
- `HIDDEN_SUPERADMIN_EMAIL`
- `HIDDEN_SUPERADMIN_PASSWORD`
- `LOG_RESPONSE_BODIES`
- `CASE_ATTACHMENTS_DIR` — absolute path for case attachment files (defaults under `./uploads/case-attachments`)
- `BACKUP_LOCAL_DIR` — absolute path for site backup zip output (defaults under `./backups/site`)
- `PG_BIN` — optional directory containing `pg_dump` / `psql` for Postgres site backup/restore
- `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_REGION` — optional remote backup upload
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — required with `BACKUP_S3_BUCKET` for S3 upload (`server/services/backup-remote.ts`)
- `AWS_REGION` — optional default region for S3 client when `BACKUP_S3_REGION` is unset (`server/services/backup-remote.ts`)
- `DB_BACKUP_DIR` — optional override for SQLite file backup output directory (`script/backup-db.ts`, default `backups`)
- `DB_RESTORE_FROM` — path to backup file when running `npm run restore:db` (`script/restore-db.ts`)
- `TEMP_ATTACHMENTS_MAX_AGE_HOURS`, `TEMP_ATTACHMENTS_CLEANUP_INTERVAL_MS` — tune scheduled cleanup of temporary case attachments (`server/temp-attachment-cleanup.ts`)

Production guidance:
- disable `ALLOW_DEFAULT_ADMIN` after bootstrap
- keep hidden superadmin credentials strong if enabled
- keep `LOG_RESPONSE_BODIES=false` unless actively debugging

---

## 17) Handover Checklist for Next Developer

Before taking over:

1. Run app locally and login as admin.
2. Visit both modules and both form editors.
3. Confirm scope separation by adding a section in one editor only.
4. Run `npm run verify`.
5. Read:
   - `client/src/App.tsx`
   - `client/src/pages/register-case.tsx`
   - `client/src/pages/hospital-form-editor.tsx`
   - `client/src/pages/admin.tsx` (AST editor mode)
   - `server/routes/admin.ts`
   - `server/routes/cases.ts`
   - `server/routes/context.ts`
   - `server/routes.ts`

If these are understood, the project is maintainable without prior author support.

---

## 18) Page -> API -> DB Map (Quick Navigation)

Use this when you need to find "where this screen gets data" fast.

- `welcome.tsx`
  - API: auth bootstrap via `GET /api/auth/me` (through auth context)
  - DB: `users`, `role_feature_visibility`
- `new-case-home.tsx`
  - API: none directly; links into hospital register/editor/history
  - DB: n/a
- `ast-report-home.tsx`
  - API: permission-driven rendering through auth context
  - DB: `users`, `role_feature_visibility`
- `register-case.tsx` (hospital mode)
  - API: `GET /api/form-definition?scope=hospital`, `GET /api/species-options`, `GET /api/breed-options`, `POST /api/cases`
  - DB: `form_sections`, `form_questions`, `species_options`, `breed_options`, `cases`
- `register-case.tsx` (ast mode)
  - API: `GET /api/form-definition?scope=ast`, `POST /api/ast/cases`
  - DB: `form_sections`, `form_questions`, `cases`
- `hospital-form-editor.tsx`
  - API: `/api/admin/form-definition?scope=hospital`, `/api/admin/form-sections`, `/api/admin/form-questions`, `/api/admin/form-edit-logs`, species/breed admin endpoints
  - DB: `form_sections`, `form_questions`, `form_edit_audit_logs`, `species_options`, `breed_options`
- `ast-form-editor.tsx` + `admin.tsx` (`form-only`)
  - API: same admin form endpoints but `scope=ast`
  - DB: `form_sections`, `form_questions`, `form_edit_audit_logs`
- `case-list.tsx`
  - API: `GET /api/cases`, deletes via `DELETE /api/cases/:id` (admin)
  - DB: `cases`
- `profile.tsx`
  - API: `PATCH /api/users/me`, `POST /api/auth/password-reset-requests`, `POST /api/auth/logout-all-sessions`
  - DB: `users`, `password_reset_requests`, `sessions`
- `admin.tsx` (users/downloads/resets)
  - API: `/api/admin/users*`, `/api/admin/download-requests*`, `/api/admin/password-reset-requests*`, `/api/admin/feature-visibility/dashboard*`
  - DB: `users`, `download_requests`, `password_reset_requests`, `role_feature_visibility`

---

## 19) Role Capability Matrix

Current effective capability model (see `server/routes/context.ts`):

- `superadmin`
  - `hospital.case.create`, `hospital.case.view`, `ast.case.create`, `ast.case.view`, `ast.download`, `ast.admin`
- `admin`
  - `hospital.case.create`, `hospital.case.view`, `ast.case.create`, `ast.case.view`, `ast.download`, `ast.admin`
- `staff`
  - `hospital.case.create`, `hospital.case.view`, `ast.case.create`, `ast.case.view`, `ast.download`
- `intern`
  - `hospital.case.create`, `hospital.case.view`, `ast.case.create`, `ast.case.view`, `ast.download`
- `student`
  - `hospital.case.create`, `hospital.case.view`, `ast.case.view`
  - note: download path for students is handled by request-approval logic in `canDownload`
- `pending`
  - no case-view/create capabilities (blocked from AST/Hospital case flows)

When changing these, keep server + client fallback logic in sync:
- server: `server/routes/context.ts`
- client fallback: `client/src/lib/auth.tsx`

---

## 20) Built-in Field Registry (Hospital-focused)

These are high-risk fields that must stay synced between register form + editors + seeds:

- History section:
  - `historyNotes`
  - `previousMedicationNotes`
- Clinical section:
  - `clinicalSignsSymptomsNotes`
- Vitals section (examples):
  - `temperature`, `crt`, `dehydrationPercentage`, `heartRate`, `respiratoryRate`, `rumenMotility`
  - `chiefComplaint`, `weight`, `colour`
- Avian section:
  - `flockSize`, `hatchery`, `feedSupplier`, `feedIntake`, `waterIntake`, `mortality`
- Tests Suggested section:
  - `testsSuggested`, `enzymePanelTests`, `rapidDiagnosticTests`
  - `xrayDetails`, `ultrasoundDetails`, `biopsyDetails`, `cytologyDetails`, `cultureDetails`
- Final remarks:
  - `remarks`

Canonical touchpoints:
- render + submit: `client/src/pages/register-case.tsx`
- hospital editor visibility/toggles: `client/src/pages/hospital-form-editor.tsx`
- DB seeds/bootstrap: `server/routes.ts`
- server form API behavior: `server/routes/admin.ts`, `server/routes/cases.ts`

---

## 21) Change Recipes (Safe Playbooks)

### A) Add a new hospital built-in field
1. Add render + state + submit normalization in `register-case.tsx`
2. Include built-in recognition in hospital editor helper logic
3. Add fallback injection in hospital editor (if needed)
4. Add seed/default in `server/routes.ts` (`form_sections`/`form_questions`)
5. Ensure hospital scope tagging (`form_scope='hospital'`)
6. Run `npm run verify`

### B) Add a new AST-only field
1. Add in AST editor flow (`admin.tsx` form-only mode and/or defaults)
2. Ensure register form shows it only for AST mode
3. Ensure hospital filtering excludes it
4. Persist with `scope=ast`
5. Run `npm run verify`

### C) Add a new role/capability
1. Add capability type in server and client auth typings
2. Update resolver in `server/routes/context.ts`
3. Update fallback in `client/src/lib/auth.tsx`
4. Apply route/UI guards in `App.tsx` and page-level checks
5. Validate by logging in with each affected role

### D) Add a new admin action
1. Add backend endpoint in `server/routes/admin.ts`
2. Add authorization middleware check
3. Add frontend mutation in `admin.tsx` (or page-specific file)
4. Add audit log write if action is sensitive/config-changing
5. Add/adjust tests

---

## 22) Troubleshooting Runbook

### Dev server starts but UI crashes
- Check terminal for Vite/TS parse errors (common after quick refactors)
- Run `npm run check` for exact TypeScript lines
- Fix first syntax/type error; many UI errors are cascading

### `better-sqlite3` issues on Windows
- Stop running node processes
- Rebuild native module:
  - `npm rebuild better-sqlite3`
- Then restart dev server

### Form appears in registration but not editor
- Missing sync in hospital/AST editor fallback or built-in recognition
- Check:
  - `register-case.tsx`
  - `hospital-form-editor.tsx` or AST form editor path in `admin.tsx`
  - `server/routes.ts` seeds

### Hospital/AST cross-talk (section appears in both modules)
- Verify scope parameters on frontend requests
- Verify scope filtering in backend form endpoints
- Verify `form_scope` values in DB for affected rows

### Unexpected 401 loops
- Session may be expired/cleared (expected on restart)
- Re-login and recheck
- Confirm token logic in `client/src/lib/auth.tsx`

### Back button inconsistency
- Standard reference pattern: `case-list.tsx` header
- Reuse icon-only ghost back button layout for consistency

---

## 23) Recent Hardening Changes (Important)

These changes were applied to prevent cross-module leakage and privilege issues:

- **Strict route namespacing as hard boundary**
  - Case detail/print routes are module-namespaced:
    - AST: `/ast-report/cases/:id`, `/ast-report/print/:id`
    - Hospital: `/new-case/cases/:id`, `/new-case/print/:id`
  - Shared legacy routes are redirects only.

- **Pending role restrictions**
  - Pending users no longer have AST/Hospital case view/create capabilities.

- **Dashboard scope auth tightening**
  - `GET /api/dashboard/summary` now requires scope-specific case-view capability in addition to dashboard visibility flags.

- **Admin security fixes**
  - `/api/admin/users/:id/approve` no longer lets non-superadmin assign admin/superadmin roles.
  - Password reset request APIs no longer expose password hashes in responses.

- **Counter integrity hardening**
  - Case creation now computes `caseNumber`, `dailyNumber`, `monthlyNumber`, and `yearlyNumber` on the server (canonical source).
  - Yearly counter added to shared schema and print/detail UI.
  - Repair script added: `script/normalize-case-counters.cjs` for historical counter normalization.

- **Database identity constraints for cases**
  - Migration-enforced uniqueness now protects:
    - `case_number` (global uniqueness)
    - scoped daily counter (`scope + date + daily_number`)
    - scoped monthly counter (`scope + year-month + monthly_number`)
    - scoped yearly counter (`scope + year + yearly_number`)
  - This prevents counter collisions at DB layer even under concurrent requests.

- **Explicit migration runner introduced**
  - New `server/migration-runner.ts` executes pending `.sql` files from:
    - `migrations/` (SQLite)
    - `migrations-pg/` (Postgres)
  - Applied migration IDs are tracked in `schema_migrations`.
  - Startup rewrites for constraints/backfills are now handled via migration files.

- **Centralized admin action audit log**
  - New `admin_action_logs` table records sensitive admin actions with:
    - actor (`actor_user_id`, `actor_role`)
    - action + target metadata (`action_type`, `target_type`, `target_id`)
    - structured details (`details_json`)
    - timestamp (`created_at`)
  - Currently logged actions:
    - user approval
    - user role change
    - download request resolution
    - password reset request resolution

- **Regression test coverage added**
  - `server/routes/cases.scope-permissions.test.ts`
  - `server/routes/cases.module-scope.e2e.test.ts`
  - `server/routes/frontend-route-contract.test.ts`
  - `server/routes/admin.notifications.test.ts` (notification lifecycle)

