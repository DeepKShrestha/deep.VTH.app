# Vet AST App - Developer Handover Guide

This project is a veterinary teaching hospital application with two primary modules:

- **VTH Case Registration** (hospital cases)
- **AST Report Module** (AST-focused workflow)

This README is a practical handover for the next developer to maintain and extend the app safely.

---

## Maintainer guide (read this first)

### Stronger process than a one-time “cleanup”

A single cleanup PR helps today, but **entropy returns** without automation. After handoff, the highest‑leverage additions are:

| Practice | Why |
|----------|-----|
| **CI runs** `npm run verify` **and a Knip “orphan files” job** (see `.github/workflows/ci.yml`) | Same gates locally and on PRs; Knip catches unreachable source files. |
| **Optional: full `knip`** (`npm run knip`, includes deps/unused exports) | Stricter cleanup; tune config before failing CI on it. |
| **`docs/ADR/`** (short Architecture Decision Records) | When you change auth, DB, or permissions, one file per decision beats long Slack threads. |
| **`CONTRIBUTING.md`** | PR checklist, how to run migrations, and “who approves production config”. |

This README stays the **map of the whole system**; split only when a section becomes huge (e.g. move long SQL notes to `docs/`).

**Deployment docs (start here if you're shipping to a server):**

- **[`docs/DIGITALOCEAN-DEPLOYMENT.md`](docs/DIGITALOCEAN-DEPLOYMENT.md)** — beginner-friendly walkthrough for deploying to **DigitalOcean** (Droplet + Managed Postgres). Hand-holds through SSH-key generation, billing setup, every command, plus a feature-verification checklist. Use this if you've never deployed a Node app before.
- **[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)** — full step-by-step walkthrough for a **fresh Linux server**: OS prep, Node install, service user, SQLite **or** PostgreSQL setup, env vars, systemd unit, nginx + Let's Encrypt TLS, automated backups, day-2 ops, upgrades, rollback, troubleshooting. Use this if you've deployed Linux apps before and want a generic recipe.
- **[`docs/PRODUCTION-DEPLOYMENT.md`](docs/PRODUCTION-DEPLOYMENT.md)** — short pre-flight checklist (required env vars, order of operations, smoke tests). Use this once you know the deployment and just need the list.
- **[`scripts/deploy.sh`](scripts/deploy.sh)** — one-command deploy script for the Linux/systemd layout (DigitalOcean Droplet or any single-VM install at `/opt/vth-app`). Always runs `git pull`, `npm ci`, and `npm run build` as the `vth-app` user, then restarts the service and verifies it came up healthy. Usage: `sudo bash /opt/vth-app/scripts/deploy.sh` (add `--verify` to also run tests + typecheck, `--branch <name>` for non-`main`, `--no-restart` for a build-only dry run).
- **[`docs/OPERATIONS.md`](docs/OPERATIONS.md)** — day-to-day operational runbooks.
- **[`docs/RELEASE.md`](docs/RELEASE.md)** — release flow and rollback.

### Table of contents

| # | Topic |
|---|--------|
| [1](#1-quick-start) | Quick start |
| [2](#2-stack-and-runtime) | Stack and runtime |
| [3](#3-project-layout) | Project layout |
| [4](#4-module-boundaries-critical) | Module boundaries (hospital vs AST) |
| [5](#5-routing-map-frontend) | Frontend routes |
| [6](#6-permissions-and-roles) | Permissions and roles |
| [7](#7-form-system-where-to-edit-what) | Form system |
| [8](#8-built-in-field-sync-rule-important) | Built-in field sync |
| [9](#9-authentication-and-sessions) | Auth and sessions |
| [10](#10-profile-page-notes) | Profile / security |
| [11](#11-database-tables-you-will-touch-most) | Main DB tables |
| [12](#12-operational-commands) | Commands and ops |
| [12a](#12a-production-deployment-summary) | Production deployment (summary) |
| [12b](#12b-continuous-integration) | Continuous integration |
| [13](#13-api-surface-high-level) | API surface |
| [14](#14-safe-change-workflow) | Safe change workflow |
| [15](#15-common-gotchas) | Gotchas |
| [16](#16-environment-variables) | Environment variables |
| [17](#17-handover-checklist-for-next-developer) | Handover checklist |
| [18](#18-page---api---db-map-quick-navigation) | Page → API → DB map |
| [19](#19-role-capability-matrix) | Capability matrix |
| [20](#20-built-in-field-registry-hospital-focused) | Built-in fields |
| [21](#21-change-recipes-safe-playbooks) | Change recipes |
| [22](#22-troubleshooting-runbook) | Troubleshooting |
| [23](#23-recent-hardening-changes-important) | Recent hardening |
| [24](#24-production-deployment-deployer-handbook) | Production deployment (deployer handbook) |
| [25](#25-where-the-detailed-server-deployment-guide-lives) | Where the detailed server deployment guide lives |

### Request flow (mental model)

```mermaid
flowchart TB
  subgraph client [Browser]
    UI[React + Vite + Wouter]
    Q[TanStack Query]
  end
  subgraph server [Node]
    E[Express 5]
    M[Auth middleware / capabilities]
    R[Routes: auth, admin, cases, backup, ...]
    D[(SQLite or Postgres)]
  end
  UI --> Q
  Q -->|"JSON /api/*"| E
  E --> M
  M --> R
  R --> D
```

### Feature index (where to change what)

| Area | What users do | Primary UI | Primary API / server |
|------|----------------|------------|----------------------|
| Login / signup | Sign in, register | `client/src/pages/login.tsx`, `signup.tsx` | `server/routes/auth.ts` |
| Home / navigation | Choose VTH vs AST | `welcome.tsx`, `new-case-home.tsx`, `ast-report-home.tsx` | — |
| Hospital case | Register, list, view, print | `register-case.tsx` (mode=hospital), `case-list.tsx`, `case-view.tsx`, `print-report.tsx` | `server/routes/cases.ts`, `server/case-repo.ts` |
| AST case | Register, list, view, export | same pages, `export-data.tsx` | `server/routes/cases.ts`, AST paths |
| Hospital form builder | Edit sections/questions | `hospital-form-editor.tsx` | `server/routes/admin.ts` (form-definition) |
| AST form builder | Edit AST form | `ast-form-editor.tsx`, `admin.tsx` (form-only) | `server/routes/admin.ts` |
| Treatment catalogs | Meds, routes, frequencies, dose units, **durations** | `hospital-treatment-*.tsx`, `treatment-master-data-manager.tsx` | `server/routes/admin.ts` (CRUD + logs) |
| AMR dashboard | Stats | `dashboard.tsx` | Case/export APIs |
| VTH dashboard | Hospital stats | `hospital-dashboard.tsx` | Cases |
| Admin | Users, downloads, backup, audit | `admin.tsx`, `admin-site-backup-panel.tsx` | `server/routes/admin.ts`, `backup-admin.ts` |
| Profile | Account, 2FA, prefs, photo | `profile.tsx` | `auth.ts`, prefs stores |
| Breakpoints | AST antibiotic grid | `breakpoints.tsx` | `server/routes/breakpoints.ts` |

---

## 1) Quick Start

**Prerequisites**

- **Node.js** 22.x or 24.x and npm. The supported range is in `package.json` `engines`; `.nvmrc` pins **22** for local/CI alignment (`.npmrc` sets `engine-strict=true`, so `npm install` refuses unsupported Node versions).
  - If you use `nvm` / `nvm-windows` / `fnm` / `volta` / `asdf`, run `nvm use` (or equivalent) in this repo to pick up `.nvmrc`.
- On Windows, use a normal shell (PowerShell or cmd). Native addons such as `better-sqlite3` are checked by `script/ensure-sqlite-binary.cjs` after every `npm install` / `npm ci`, before `npm run build`, and at the start of `npm run dev` (the dev script uses `script/dev-server.cjs` so the check and `tsx` always run under the same `node.exe`). Manual fix: stop other Node processes if rebuild hits “file in use”, then `npm rebuild better-sqlite3` (see §22).

**First clone**

1. Copy environment template (optional but recommended for local overrides): create `.env` from `.env.example`. The dev script sets SQLite defaults via `cross-env`, but the server still loads `.env` via `dotenv` (`server/index.ts`).
2. Install dependencies: `npm install`
3. Run locally: `npm run dev`
4. Open: `http://localhost:5001/#/`
5. Validate baseline: `npm run test`, `npm run check`, `npm run build`

**First login (empty database)**

- If there are **no users** yet (new `DB_FILE`), startup creates a **bootstrap superadmin** named `admin` in `server/routes.ts`. The password is determined as follows:
  - If you set `DEFAULT_ADMIN_PASSWORD` in `.env` (12+ chars, letters + digits), that password is used.
  - Otherwise the server **generates a random 18-byte password and prints it once** in the boot log under `[BOOTSTRAP]`. Copy it from the terminal, log in immediately, and rotate.
  - The legacy `admin123` default no longer exists.
- This bootstrap path runs when `NODE_ENV` is not `production`, or when `ALLOW_DEFAULT_ADMIN=true` in production (discouraged after go-live; see `server/index.ts` warning).
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
- `shared/capabilities.ts` - role → capability matrix (imported by `server/routes/context.ts` and `client/src/lib/auth.tsx`)
- `docs/` — release, operations, and **production deploy** checklists (`docs/RELEASE.md`, `docs/OPERATIONS.md`, **`docs/PRODUCTION-DEPLOYMENT.md`**)
- `migrations/`, `migrations-pg/` - migration history

### Backend core
- `server/index.ts` - app boot, middleware, health/ready, error handling
- `server/routes.ts` - DB bootstrap + seed + route registration
- `server/routes/auth.ts` - login/signup/me/logout/profile/password-reset requests
- `server/routes/admin.ts` - admin APIs, form-definition APIs, users, downloads, resets
- `server/routes/cases.ts` - case APIs, form-definition read, export/download paths
- `server/routes/context.ts` - auth middleware; re-exports capabilities from `shared/capabilities.ts`; permission guards
- `server/auth-session-repo.ts` - auth/session data access abstraction

### Frontend core
- `client/src/App.tsx` - route wiring and protected routes
- `client/src/lib/auth.tsx` - auth context, role/capability helpers, session preferences
- `client/src/pages/welcome.tsx` - app home
- `client/src/pages/new-case-home.tsx` - VTH module home
- `client/src/pages/ast-report-home.tsx` - AST module home
- `client/src/pages/ast-settings.tsx` - AST settings page
- `client/src/pages/hospital-treatment-settings.tsx` - treatment master hub (links to medications, routes, frequencies, dose units, durations)
- `client/src/pages/hospital-treatment-medications.tsx` / `hospital-treatment-routes.tsx` / `hospital-treatment-frequencies.tsx` / `hospital-treatment-dose-units.tsx` / `hospital-treatment-durations.tsx` - catalog CRUD (shared `TreatmentMasterDataManager`)
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
- `/new-case/settings` - VTH module settings
- `/new-case/settings/treatment` - treatment master hub (catalogs)
- `/new-case/settings/treatment/medications` | `routes` | `frequencies` | `dose-units` | `durations` - individual catalogs
- `/new-case/settings/veterinarians` - veterinarian directory
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
- `/dashboard` - AMR statistical dashboard (AST)
- `/new-case/dashboard` - VTH hospital dashboard
- `/export` - AST data export / download requests
- `/new-case/export` - same flows scoped from VTH home

Legacy compatibility redirects:
- `/cases` -> `/ast-report/cases`
- `/cases/:id` -> `/ast-report/cases`
- `/print/:id` -> `/ast-report/cases`

---

## 6) Permissions and Roles

**Canonical capability definitions:** `shared/capabilities.ts` (`PermissionCapability`, `resolveCapabilitiesForRole`, `hasCapability`). The API imports and re-exports these from `server/routes/context.ts`; the client imports the same module in `client/src/lib/auth.tsx` for UI gating (so server and client stay aligned).

Role model:
- `superadmin`, `admin`, `staff`, `intern`, `student`, `pending`

Main capabilities:
- `hospital.case.create`
- `hospital.case.view`
- `ast.case.create`
- `ast.case.view`
- `ast.download`
- `ast.admin`

When changing permission behavior:
1. update **`shared/capabilities.ts`** first (single source of truth)
2. adjust route guards / `requireAnyCapability` usage in `server/routes/*.ts` if you add or rename capabilities
3. validate route guards in `App.tsx` and any page-level checks
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
- **API bearer token** is kept in **`sessionStorage`** (same-tab reload survives; closing the tab ends the session). A small in-memory cache avoids races during HMR. Other prefs (e.g. inactivity timeout, confirm-before-logout) use `localStorage` — see `client/src/lib/auth.tsx`.

Backend sessions:
- Tables: `sessions` (token → user_id) + `users` (the user row).
- **On boot, ALL session rows are wiped by default** (`server/session-boot-prune.ts`) — a server restart is effectively a force-logout for everyone (the boot log warns when this happens). Set `WIPE_SESSIONS_ON_BOOT=false` to opt out and keep active sessions across restarts (useful on a dev laptop with nodemon; only expired rows are pruned in that mode).
- `last_seen_at` writes are **throttled** to one DB write per session every 30 seconds (`server/auth-session-repo.ts#SESSION_LAST_SEEN_THROTTLE_MS`). Prevents a write storm on hot paths while keeping presence accurate within the 3-minute active window.
- `requireAuth` uses a **short-lived in-memory cache** of the current-user snapshot keyed by bearer token (`server/current-user-cache.ts`). TTL ≈ 30 s, 5 000-entry cap, invalidated explicitly on `updateUser` / session delete. Keeps high-traffic endpoints from re-reading the `users` row on every request.
- Sessions are deleted **explicitly** on logout, password change, user deletion, and bulk admin deletes.

Signed image URLs:
- Case attachment images and profile photos use **HMAC-signed time-limited URLs** (`server/services/attachment-signing.ts`). Signatures are bound to the issuing **user id** (`uid` claim) — a URL leaked to another user is rejected.
- TTL is configurable via `ATTACHMENT_SIGNING_TTL_MS` (default 15 min).

Endpoints:
- `POST /api/auth/logout-all-sessions` (current user only)
- `POST /api/auth/password-reset-requests` (forgot-password flow on the login screen — admin must approve)

---

## 10) Profile Page Notes

Profile implementation:
- `client/src/pages/profile.tsx`

Current features include:
- Card-based layout (Account, Security, Session Preferences, Role & Permissions).
- **Self-service password change** — fill current + new, click **Save Changes**. **No admin approval is needed for users who can sign in**; the change takes effect immediately and all of the user's other sessions are terminated automatically. The admin-approval "Request Password Reset" button was removed in May 2026 because it confused users.
- Sticky save bar with unsaved/saved state.
- Logout-all-sessions confirmation.
- 2FA enrollment/disable (admin and superadmin roles only).

Forgot-password flow (separate from the Profile page):
- The login screen has a **Forgot password?** link. Users who cannot sign in submit a request with their identifier and a new password; an admin reviews it under **Admin → Password Resets** and approves or rejects. Hashes never leave the server in plain text.

Backend profile endpoints:
- `PATCH /api/users/me` — self-service profile + password updates. Requires the current password for password changes. Validates strength via `validateStrongPassword` and terminates the user's other sessions on success.
- `POST /api/auth/password-reset-requests` — public endpoint used by the login screen's Forgot-password flow.
- `POST /api/auth/logout-all-sessions` — terminates every session for the current user.

---

## 11) Database Tables You Will Touch Most

Core domain:
- `users` — accounts, role, approval, 2FA secrets, profile photo path.
- `sessions` — bearer-token → user_id, with `created_at`, `expires_at`, `last_seen_at`. FK to `users` with `ON DELETE CASCADE` (Postgres) or trigger-enforced cleanup (SQLite).
- `cases` — both hospital and AST cases (distinguished by `case_number` prefix `CASE-` vs `AST-`).
- `case_attachments` — uploaded images per case. FK to `cases` with `ON DELETE CASCADE`.
- `case_change_logs` — per-case audit trail of edits. FK to `users` with `ON DELETE RESTRICT` so authorship is never lost.
- **`case_counters`** *(new in `0015_case_counters.sql`)* — composite key per scope/date/year/month. Atomically allocated via `server/case-counters.ts#allocateCaseIdentifiers` so concurrent case registrations cannot collide on daily/monthly/yearly/case numbers.

Form system:
- `form_sections`, `form_questions` (both have `form_scope` for hospital/ast separation).
- `form_edit_audit_logs` — every admin edit of the form definition.

Authorization & lifecycle:
- `download_requests` — student data-export approvals. FK to `users`. Approvals are **range-bound** (BS `dateFrom`/`dateTo`) and **single-use** (consumed atomically on first export).
- `password_reset_requests` — Forgot-password submissions from the login screen. FK to `users`.
- `role_feature_visibility` — admin-driven flags for which roles see which features.
- `admin_action_logs` — centralized audit log of sensitive admin actions (approvals, role changes, request resolutions, etc.).

Reference catalogs:
- `species_options`, `breed_options`
- `medications`, `medication_routes`, `medication_frequencies`, `medication_dose_units`, `medication_durations`
- `breakpoints` — AST antibiotic interpretation grid.
- `veterinarians`.

Schema source:
- **`shared/schema.ts`** — Drizzle table definitions and Zod schemas. Foreign keys are declared here (`references(() => users.id, { onDelete: 'cascade' })`).
- **`migrations/`** (SQLite) and **`migrations-pg/`** (Postgres) — incremental SQL scripts applied on boot by `server/migration-runner.ts`. Already-applied IDs are tracked in `schema_migrations`.

Bootstrap + seed source:
- `server/routes.ts` — table creation if missing, default seed data, bootstrap admin.
- `server/migration-runner.ts` + `server/sql-statement-splitter.ts` — applies SQL migrations on boot. The splitter is trigger-aware so `CREATE TRIGGER ... BEGIN ... END;` blocks stay intact.

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
- **Deployer checklist (env, order of operations, smoke tests):** `docs/PRODUCTION-DEPLOYMENT.md`
- `npm run build` then `npm run start` (or `npm run start:sqlite` for SQLite-only prod)
- Pre-release checklist: `docs/RELEASE.md` and `docs/OPERATIONS.md`

Site backup / restore (SQLite smoke, optional):
- `npx tsx script/smoke-backup-restore.ts` — copies `./data.db` to a temp tree, runs backup + restore checks (requires an existing dev `data.db`).

---

## 12a) Production deployment (summary)

**Full checklist for the person deploying:** **`docs/PRODUCTION-DEPLOYMENT.md`** (required variables such as `ATTACHMENT_SIGNING_SECRET`, database choice, build commands, post‑deploy checks, rollback pointer).

The app is designed to run as a **single Node process** behind a reverse proxy (nginx, Caddy, or a PaaS edge) that terminates **TLS**. The server sets `trust proxy` for correct client IP behavior behind one proxy hop.

**Typical single-VM layout**

1. Set environment variables (start from `.env.example`); use **absolute paths** for `DB_FILE`, `CASE_ATTACHMENTS_DIR`, and `BACKUP_LOCAL_DIR` in production.
2. `npm ci` (or `npm install`), then `npm run verify`, then `npm run build`.
3. Run `npm run start` under a process manager (systemd, PM2, or your platform’s supervisor).
4. Point the reverse proxy at `PORT` (default in `.env.example` is `5000`; dev uses `5001` in `npm run dev`).
5. Validate `GET /api/health` and `GET /api/ready` after deploy.

**For an existing Linux/systemd install at `/opt/vth-app` (DigitalOcean Droplet layout), every subsequent deploy is a single command:**

```bash
sudo bash /opt/vth-app/scripts/deploy.sh
```

The script (see `scripts/deploy.sh`) always runs git/npm as the `vth-app` user, self-heals ownership of `/opt/vth-app`, runs `npm ci && npm run build`, restarts the service, and verifies it is Active. Add `--verify` to also run tests + typecheck, `--branch <name>` for non-`main`, `--no-restart` for a build-only dry run.

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
- On push to `main`/`master` and on pull requests: `npm ci`, then **`npm run verify`** (test + typecheck + build), plus a **`knip`** job (`npm run knip:files`) to catch orphan source files. Align local work with `npm run verify` before you push.

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

Variables used across the server, backup/restore, and scripts. **`.env.example` is the canonical template** (required and common optional keys, commented). Copy it to `.env` and uncomment or set values as needed. For a full deploy walkthrough, see **[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)**.

### Required in production

| Variable | Purpose |
|----------|---------|
| `NODE_ENV=production` | Enables Helmet CSP, refuses to start without `ATTACHMENT_SIGNING_SECRET`, ignores `LOG_RESPONSE_BODIES`, etc. |
| `PORT` | Port the Node process listens on (default 5000). |
| `ATTACHMENT_SIGNING_SECRET` | **≥32 characters.** HMAC for signed case‑attachment and profile‑photo URLs. The process **exits at boot** if unset/short. |
| `DB_PROVIDER` | `sqlite` (default) or `postgres`. |
| `DB_FILE` *(sqlite)* | Absolute path to the SQLite file. |
| `DATABASE_URL` *(postgres)* | Standard `postgres://user:pass@host:port/db` connection string. |

### Bootstrap admin

| Variable | Purpose |
|----------|---------|
| `ALLOW_DEFAULT_ADMIN` | Allows the bootstrap admin to be created in production. Keep `false` after the first real admin exists. |
| `DEFAULT_ADMIN_PASSWORD` | Pin the bootstrap admin's password (12+ chars, letters + digits). If unset, a random password is generated and **logged once** at boot. The legacy hardcoded `admin123` no longer exists. |

### Hidden break-glass account (optional)

| Variable | Purpose |
|----------|---------|
| `HIDDEN_SUPERADMIN_ENABLED` | `false` by default. Set `true` only if you actually need a hidden account. |
| `HIDDEN_SUPERADMIN_USERNAME` / `HIDDEN_SUPERADMIN_EMAIL` | Identity of the account. |
| `HIDDEN_SUPERADMIN_PASSWORD` | **Required** when enabled. 16+ chars, letters + digits. **Production refuses to start** if missing/weak; **development** logs a warning and skips bootstrap. |

### Sessions / hardening

| Variable | Purpose |
|----------|---------|
| `WIPE_SESSIONS_ON_BOOT` | Default behaviour is to **wipe all sessions on boot** (every restart = force-logout for everyone, with a warning logged). Set `WIPE_SESSIONS_ON_BOOT=false` to keep active sessions across restarts (only expired rows pruned). |
| `ATTACHMENT_SIGNING_TTL_MS` | Lifetime of signed image URLs in ms (60 000–86 400 000). Default **900 000 (15 min)**. URLs are user-bound. |
| `LOG_RESPONSE_BODIES` | **Ignored in production** (response bodies are never logged when `NODE_ENV=production`). Useful for local debugging only. |

### Storage paths (use absolute paths in production)

| Variable | Purpose |
|----------|---------|
| `CASE_ATTACHMENTS_DIR` | Case-attachment uploads (default `./uploads/case-attachments`). |
| `BACKUP_LOCAL_DIR` | Superadmin site-backup zip output (default `./backups/site`). |
| `DB_BACKUP_DIR` | SQLite snapshot output for `npm run backup:db` (default `backups`). |
| `DB_RESTORE_FROM` | Path to a SQLite backup for `npm run restore:db`. |
| `PG_BIN` | Directory containing `pg_dump` / `psql` when not on `PATH` (Postgres site backups). |

### Remote backup upload (optional)

| Variable | Purpose |
|----------|---------|
| `BACKUP_S3_BUCKET` / `BACKUP_S3_PREFIX` / `BACKUP_S3_REGION` | S3 destination for site backups uploaded from the Admin UI. |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Required with `BACKUP_S3_BUCKET`. |
| `AWS_REGION` | Fallback region when `BACKUP_S3_REGION` is unset. |

### Misc tunables

| Variable | Purpose |
|----------|---------|
| `TEMP_ATTACHMENTS_MAX_AGE_HOURS` | Max age for orphan temp uploads (default 72). |
| `TEMP_ATTACHMENTS_CLEANUP_INTERVAL_MS` | Scheduler interval, min 60 000 (default 6 hours). |

Production checklist:
- Set `ATTACHMENT_SIGNING_SECRET` before first boot (see [`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)).
- Disable `ALLOW_DEFAULT_ADMIN` after creating your first real admin.
- Keep `HIDDEN_SUPERADMIN_ENABLED=false` unless you genuinely need it; if enabled, use a long random password.
- Never set `LOG_RESPONSE_BODIES=true` in production (it would be ignored anyway).


---

## 17) Handover Checklist for Next Developer

Before taking over:

1. Run app locally and login as admin.
2. Visit both modules and both form editors.
3. Confirm scope separation by adding a section in one editor only.
4. Run `npm run verify`.
5. Read **[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)** (full walkthrough) or **`docs/PRODUCTION-DEPLOYMENT.md`** (short checklist) before deploying anywhere shared.
6. Read these files in order — they're the spine of the project:
   - `client/src/App.tsx` — route table and protected routes.
   - `client/src/lib/auth.tsx` — auth context, capabilities, prefs.
   - `client/src/pages/register-case.tsx` — case registration (hospital + AST).
   - `client/src/pages/hospital-form-editor.tsx` — form builder (hospital).
   - `client/src/pages/admin.tsx` — admin panel + AST form editor (via `mode="form-only"`).
   - `shared/schema.ts` — DB schema and Zod types.
   - `shared/capabilities.ts` — role → capability map (single source of truth).
   - `server/routes.ts` — startup, migrations, session prune, bootstrap admin.
   - `server/routes/context.ts` — auth middleware and capability guards.
   - `server/routes/admin.ts` — admin APIs (users, downloads, form definition).
   - `server/routes/cases.ts` — case CRUD and form-definition reads.
   - `server/case-counters.ts` — atomic case-number allocation.
   - `server/auth-session-repo.ts` — session lifecycle and user lookups.
   - `server/current-user-cache.ts` — short-lived auth cache.
   - `server/migration-runner.ts` + `server/sql-statement-splitter.ts` — migration runtime.

If these are understood, the project is maintainable without prior author support.

### "I need to change X" cheat sheet

| You want to… | Touch these files |
|--------------|-------------------|
| Add a hospital form field | `register-case.tsx` (render + submit) → `hospital-form-editor.tsx` (toggle) → `server/routes.ts` (seed) → §21 recipe A |
| Add an AST-only form field | `admin.tsx` `form-only` mode → register-case AST branch → `server/routes/admin.ts` defaults → §21 recipe B |
| Add a new user role | `shared/capabilities.ts` (resolver) → server guards in `server/routes/*.ts` → UI gating in `client/src/lib/auth.tsx` → `App.tsx` route guards → §21 recipe C |
| Add an admin action | new endpoint in `server/routes/admin.ts` → audit-log write to `admin_action_logs` → UI in `admin.tsx` → §21 recipe D |
| Change DB schema | `shared/schema.ts` + new file under `migrations/` and `migrations-pg/` → bump migration number, **forward-only** |
| Tune session timeout | `client/src/lib/auth.tsx` (inactivity timeout pref) + server-side TTL in `auth-session-repo.ts` |
| Adjust signed-URL TTL | `ATTACHMENT_SIGNING_TTL_MS` env var |
| Force-logout everyone on deploy | Default — every restart already does this. To opt out for a dev laptop, set `WIPE_SESSIONS_ON_BOOT=false`. |
| Reset the admin password | login screen → Forgot password → another admin approves; **or** the hidden superadmin if enabled; **or** the manual DB recipe in `docs/SERVER-DEPLOYMENT-GUIDE.md` §17 |

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

The capability list is defined once in **`shared/capabilities.ts`** and imported by **`server/routes/context.ts`** (API authorization) and **`client/src/lib/auth.tsx`** (UI gating). Change that shared module and keep server routes aligned with any new capability names.

Current effective capability model:

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
  - **Data scope:** students only see **cases they registered** (`registered_by`) in list, detail, exports, dashboard aggregates, and patient‑history matches—unless you change that policy in code.
  - note: download path for students is handled by request-approval logic in `canDownload`
- `pending`
  - no case-view/create capabilities (blocked from AST/Hospital case flows)

When changing these, update **`shared/capabilities.ts`**; the server re‑exports helpers from there via `server/routes/context.ts`, and the client imports the same module in `client/src/lib/auth.tsx`.

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
1. Extend the union and resolver in **`shared/capabilities.ts`**
2. Re-export / imports flow automatically through `server/routes/context.ts` and `client/src/lib/auth.tsx` (adjust if you add new imports)
3. Apply route/UI guards in `App.tsx` and page-level checks
4. Validate by logging in with each affected role

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
- `script/ensure-sqlite-binary.cjs` runs after `npm install` / `npm ci`, before `npm run build`, and at the start of `npm run dev` (via `script/dev-server.cjs`, which uses the same Node binary for the check and for `tsx`). It tries `require("better-sqlite3")` and runs `npm rebuild better-sqlite3` only when the error clearly indicates an ABI mismatch (generic `ERR_DLOPEN_FAILED` alone is not treated as ABI—on Windows it often means the DLL is locked). You should rarely need to fix this by hand.
- If you launched the server some other way (e.g. `node dist/index.cjs` after a Node major upgrade) and see the ABI error, `server/db.ts` now wraps it with a single actionable line pointing back here.
- Manual recovery if the preflight ever fails:
  - Stop running node processes
  - `npm rebuild better-sqlite3` (requires Python + a C++ toolchain on Windows; install Visual Studio Build Tools if missing)
  - Restart dev server
- Root cause for new contributors: `better-sqlite3` is a native module pinned to a Node ABI (`NODE_MODULE_VERSION`). Changing Node major versions (20 ↔ 22 ↔ 24) without reinstalling breaks the binary. The repo pins Node via `.nvmrc` + `engines` to keep everyone on the same ABI.

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

- **Production signing and deployer docs**
  - **`ATTACHMENT_SIGNING_SECRET`** is **mandatory** when running the production bundle (`NODE_ENV=production`); the process exits on startup if it is missing or too short.
  - **`ATTACHMENT_SIGNING_TTL_MS`** controls signed image URL lifetime (default **15 min** since May 2026).
  - Signed URLs are now **user-bound** (`uid` claim) — a URL issued to one user is rejected for another.
  - **`docs/PRODUCTION-DEPLOYMENT.md`** lists everything a deployer must configure and verify (for handoff to non-authors). **`docs/SERVER-DEPLOYMENT-GUIDE.md`** is the longer step-by-step companion (added May 2026).

### May 2026 hardening pass (P0/P1/P2)

These landed together as a production-readiness sweep:

| Change | File(s) | Why |
|--------|---------|-----|
| **Atomic case-number allocation** | `migrations*/0015_case_counters.sql`, `server/case-counters.ts` | Removes the `COUNT(*) + 1` race that could produce duplicate `case_number` values under concurrent registration. |
| **Foreign keys + cascade triggers** | `migrations*/0016_foreign_keys.sql`, `server/sql-statement-splitter.ts` | Orphan rows (sessions, download_requests, password_reset_requests, case_change_logs, case_attachments) are cleaned and enforced at DB level. SQLite uses triggers; Postgres uses real FKs. The splitter is required so SQLite `CREATE TRIGGER ... BEGIN...END;` blocks survive migration parsing. |
| **Range-bound, single-use student exports** | `server/download-request-auth.ts`, `server/download-request-range.ts`, `client/src/lib/export-approval.ts`, `client/src/pages/export-data.tsx`, `client/src/pages/hospital-export-data.tsx` | Approvals carry a BS `dateFrom`/`dateTo` window; the server consumes the approval atomically on first export. The UI auto-fills the picker with the approved range and disables download if the range mismatches. |
| **Bootstrap admin no longer uses `admin123`** | `server/routes.ts`, `server/password-policy.ts`, `.env.example` | `DEFAULT_ADMIN_PASSWORD` must be strong; if unset, a random password is printed once. Hidden superadmin requires 16+ chars w/ letters and digits in production. |
| **Sessions wiped on every server restart (default)** | `server/session-boot-prune.ts`, `server/routes.ts` | Restarts log everyone out — the safer posture for a clinic deployment. Set `WIPE_SESSIONS_ON_BOOT=false` to opt out (keeps active sessions across restarts; only expired rows pruned). |
| **`last_seen_at` write throttle** | `server/auth-session-repo.ts` (`SESSION_LAST_SEEN_THROTTLE_MS`) | One DB write per session every 30 seconds instead of every request — must stay well below the 3-min active window. |
| **`requireAuth` in-memory cache** | `server/current-user-cache.ts`, `server/routes/context.ts` | 30-second LRU cache (5 000 entries) of CurrentUser snapshots keyed by bearer token. Explicit invalidation on `updateUser`, session delete, bulk clears. |
| **N+1 query reduction in admin lists** | `server/routes/admin.ts` (`/api/admin/password-reset-requests`, `/form-edit-audit-logs`, `/action-logs`) | Replaced per-row `getUserById` with batched `getUserDisplayByIds`. |
| **Formula-injection protection in CSV/XLSX** | `server/routes/cases-export.ts` | Cell values starting with `= + - @ \t \r` get a leading apostrophe so spreadsheet apps don't execute them. |
| **CSV exports never return an empty body** | `server/routes/cases-export.ts` | When no rows match, the file still contains the header row + UTF-8 BOM so users can tell the export ran and the filter was simply too narrow. Both export endpoints now log `matched=N`. |
| **Self-service password change clarified** | `client/src/pages/profile.tsx` | The "Request Password Reset (Admin Approval)" button was removed from the Profile page — it implied admin approval was needed for normal password changes, which was incorrect. Forgot-password is still admin-approved and lives on the login screen. |
| **Zip-slip fix in site restore** | `server/services/restore-service.ts` | Path-traversal check rejects archive entries that try to escape the destination directory. |
| **Strong password helper** | `server/password-policy.ts` | Reusable `isStrongPassword(value, minLength)` for default admin and hidden superadmin paths. |

### Helper modules worth knowing about

| Module | Role |
|--------|------|
| `server/case-counters.ts` | Atomically allocates `dailyNumber`, `monthlyNumber`, `yearlyNumber`, and `caseNumber` via the `case_counters` table. |
| `server/case-repo.ts` | Thin data-access layer for cases used by both modules. |
| `server/current-user-cache.ts` | In-memory cache of CurrentUser snapshots; keyed by bearer token. |
| `server/auth-session-repo.ts` | All session and user lifecycle; invalidates the current-user cache on writes. |
| `server/download-request-auth.ts` + `server/download-request-range.ts` | Server-side authorization for student exports (single-use, range-bound). |
| `server/sql-statement-splitter.ts` | Migration-aware SQL splitter; understands `BEGIN ... END;` so trigger bodies survive. |
| `server/migration-runner.ts` | Applies pending migrations from `migrations/` (SQLite) or `migrations-pg/` (Postgres). |
| `server/session-boot-prune.ts` | Prunes sessions on boot. Default: wipe ALL sessions on every restart. Opt out with `WIPE_SESSIONS_ON_BOOT=false` (keeps active sessions; only expired rows pruned). |
| `server/password-policy.ts` | Strong-password gate used by bootstrap paths. |
| `server/services/attachment-signing.ts` | HMAC-signed, user-bound URLs for images. |
| `server/services/restore-service.ts` | Full-site backup restore (zip-slip guarded). |
| `client/src/lib/export-approval.ts` | Client-side mirror of the export approval/range logic. |
| `client/src/lib/compress-case-attachment-image.ts` | 5 MB → <1 MB image compression before upload (case attachments and profile photos). |

---

## 24) Production deployment (deployer handbook)

If you are **shipping to production** or handing off to operations, use one of the dedicated docs (not this section alone):

- **[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)** — full walkthrough for a **fresh Linux server**: OS prep, Node install, dedicated service user, SQLite **or** PostgreSQL setup, env config, systemd unit, nginx + Let's Encrypt TLS, automated backups, day-2 ops, upgrades, rollback, troubleshooting. Use this if you've never deployed the app before or you want a complete recipe to copy-paste.
- **[`docs/PRODUCTION-DEPLOYMENT.md`](docs/PRODUCTION-DEPLOYMENT.md)** — short pre-flight **checklist** (required environment variables: `ATTACHMENT_SIGNING_SECRET`, `NODE_ENV`, `PORT`, database; recommended security settings; build/run order; smoke tests; rollback pointer; CI expectations).

The short summary in **§12a** and the variable list in **§16** point here for detail.

---

## 25) Where the detailed server deployment guide lives

If you are deploying to a **fresh Linux server with a database from scratch**, the single source of truth is:

**[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md)**

It covers, in order:

1. Server provisioning (Ubuntu/Debian, firewall, user accounts).
2. Installing Node.js 22 LTS.
3. Creating a dedicated `vth-app` system user and a clean directory layout (`/opt/vth-app` for code, `/var/lib/vth-app` for state).
4. Getting the source code onto the server.
5. **Database setup** — two complete paths:
   - **SQLite** path (single instance, file-based).
   - **PostgreSQL** path (multi-instance, role creation, connection string, `pg_dump` tooling).
6. Configuring `.env` (every variable explained, not just listed).
7. Installing dependencies and building (`npm ci` + `npm run verify`).
8. First boot and admin bootstrap (including the random password the server prints once).
9. Running as a **systemd service** (full unit file with hardening flags).
10. Reverse proxy and TLS via **nginx + Let's Encrypt** (full server block + certbot commands).
11. **Automated backups** (cron entries for SQLite + Postgres + off-host sync).
12. Day-2 operations (health checks, logs, resource monitoring).
13. Upgrades and rollback (including DB restore steps).
14. A 12-row troubleshooting table for the most common boot failures.
15. A copy-pasteable cheat sheet at the end.

If anything in that guide goes stale, that file — not this README — is where you update the deployment instructions.

