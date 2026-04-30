# Vet AST App - Developer Handover Guide

This project is a veterinary teaching hospital application with two primary modules:

- **VTH Case Registration** (hospital cases)
- **AST Report Module** (AST-focused workflow)

This README is a practical handover for the next developer to maintain and extend the app safely.

---

## 1) Quick Start

1. Install dependencies:
   - `npm install`
2. Run locally:
   - `npm run dev`
3. Open:
   - `http://localhost:5001/#/`
4. Validate baseline:
   - `npm run test`
   - `npm run check`
   - `npm run build`

Recommended before any merge:
- `npm run verify`

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
- `/ast-report` - AST home
- `/ast-report/settings` - AST settings
- `/ast-report/form-editor` - AST form editor (admin only)
- `/ast-report/cases` - AST case history
- `/register` - AST registration (permission-gated)
- `/breakpoints` - breakpoints admin
- `/admin` and `/admin/downloads` - admin panel
- `/profile` - account/profile page

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

## Registration behavior
- `client/src/pages/register-case.tsx`
  - dynamic section/question rendering
  - bullet mode handling
  - avian conditional fields
  - custom field normalization on submit
  - scope-aware API usage

## Hospital form editor behavior
- `client/src/pages/hospital-form-editor.tsx`
  - section/question layout editing
  - built-in toggles (shown/required)
  - species + breeds catalog editing

## AST form editor behavior
- `client/src/pages/admin.tsx` with `mode="form-only"` and AST filters
- `client/src/pages/ast-form-editor.tsx` wrapper route page

## Backend form-definition and mutations
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

DB helpers:
- `npm run backup:db`
- `npm run restore:db`
- `npm run db:push:sqlite`
- `npm run db:push:pg`

Postgres checks:
- `npm run check:pg`
- `npm run smoke:pg:auth`

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

From `.env.example` and runtime usage:

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
  - effectively blocked by approval checks

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

