# Security Notes

This document summarizes the security posture of the Vet AST App for operators and
reviewers: where secrets live, what runs only on the server, how authentication and
authorization are enforced, the known limitations, and a production deployment checklist.

It complements (does not replace) the deployment docs:
[`docs/PRODUCTION-DEPLOYMENT.md`](docs/PRODUCTION-DEPLOYMENT.md),
[`docs/SERVER-DEPLOYMENT-GUIDE.md`](docs/SERVER-DEPLOYMENT-GUIDE.md), and the env-var
reference in [`README.md` §16](README.md#16-environment-variables).

---

## 1. Architecture in one line

The browser is a **thin client**. It only ever talks to **this app's own backend** at
same-origin `/api/...` (`client/src/lib/queryClient.ts`). There are **no direct calls
from the browser to any third-party API** (no OpenAI, payment gateway, S3, or database
access from the frontend). All privileged work happens on the Express server.

```
Browser (React/Vite)  ──JSON──>  Express /api/*  ──>  auth + capability guards  ──>  DB / S3 / pg tools
   (no secrets)                     (reads secrets from env vars)
```

## 2. Where secrets live and how they are accessed

- **All secrets are server-side environment variables.** They are read via
  `process.env.*` inside `server/` only. Nothing secret is compiled into the client
  bundle. The client's API base is a single same-origin constant
  (`client/src/lib/api-base.ts`), not a secret.
- Secret-bearing env vars include:
  - `ATTACHMENT_SIGNING_SECRET` - HMAC key for signed attachment/profile-photo URLs
    (`server/services/attachment-signing.ts`). **Required in production**; the process
    refuses to boot if it is missing or < 32 chars.
  - `DATABASE_URL` (Postgres connection string, incl. password) - `server/pg-pool.ts`.
  - `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` - only for optional S3 backup upload
    (`server/services/backup-remote.ts`).
  - `DEFAULT_ADMIN_PASSWORD`, `HIDDEN_SUPERADMIN_PASSWORD` - bootstrap credentials.
- **`.env`, `.env.local`, and `.attachment-signing-secret` are gitignored** (see
  `.gitignore`). `.env.example` is the committed, **secret-free** template.
- Secrets must be provided at runtime by the host (systemd `EnvironmentFile`, the PaaS
  secret store, etc.), never committed.

## 3. What runs only on the server

The following never execute in the browser and never expose their credentials to it:

- **Database access** (SQLite via `better-sqlite3`, or Postgres via `pg`) - all queries
  run in `server/` through Drizzle / the repos (`server/case-repo.ts`,
  `server/repos/*`, `server/auth-session-repo.ts`).
- **Signed-URL generation/verification** (`server/services/attachment-signing.ts`).
  The browser receives only short-lived, user-bound signed URLs - never the HMAC secret.
- **Site backup / restore**, including `pg_dump`/`psql` invocation and **S3 upload**
  (`server/services/backup-service.ts`, `restore-service.ts`, `backup-remote.ts`).
- **Password hashing/verification** (`bcryptjs`) and **session issuance** - opaque
  session tokens are minted and stored server-side in the `sessions` table.

## 4. How authentication & authorization are enforced

- **Auth tokens are opaque, server-side session tokens** (random value → `sessions`
  table row), not JWTs. No secret or PII is embedded in the token itself; revocation is
  immediate by deleting the session row.
- **The session token is carried in an `httpOnly` cookie** (`vth_session`, set on
  login / 2FA in `server/routes/auth.ts`, helpers in `server/routes/auth-cookies.ts`).
  Because it is `httpOnly` + `Secure` (prod) + `SameSite=Lax`, JavaScript cannot read it,
  so an XSS cannot exfiltrate the session. The browser client no longer stores a token in
  `sessionStorage` and never sends an `Authorization` header. A `Bearer <token>` header is
  still **accepted** by the server as a fallback for tests / non-browser callers - this is
  not a weakness because a forged cross-site request cannot set a custom header.
- **CSRF protection (double-submit token).** Since the browser attaches the session cookie
  automatically, cookie-authenticated **mutating** requests (`POST/PUT/PATCH/DELETE`) must
  echo a readable `vth_csrf` cookie back in the `X-CSRF-Token` header; `requireAuth`
  rejects a mismatch with `403`. Header-authenticated (Bearer) requests are exempt because
  they cannot be CSRF'd. `SameSite=Lax` on the session cookie is the first line of defence;
  the double-submit token is defence-in-depth.
- **`requireAuth`** resolves the token from the cookie (preferred) or the Bearer header,
  validates it on every protected route, enforces CSRF for cookie-based mutations
  (`server/routes/context.ts`), and is backed by a short-lived in-memory user cache
  (`server/current-user-cache.ts`) that is invalidated on user update / session delete.
- **Authorization is capability-based.** The single source of truth is
  `shared/capabilities.ts`; the server enforces it via `requireRole` /
  `requireAnyCapability` / `canDownload(Hospital)` guards, plus admin-driven
  per-role feature toggles (`role_feature_visibility`). Client-side gates in
  `client/src/lib/auth.tsx` are **cosmetic only** and are always re-checked on the server.
- **Student data exports are range-bound and single-use**, consumed atomically on first
  download (`server/download-request-auth.ts`, `download-request-range.ts`).
- **Per-role print/PDF gate (admin-configurable).** `role_feature_visibility.ast_print_visible`
  / `hospital_print_visible` let an admin disable the in-app print affordances (Print
  Report button, `/print/:id` route) and block `GET /api/cases/:id/pdf` for a role. It is
  an EXTRA gate on top of the case-view capability and defaults to visible. Note: it cannot
  stop a user who can already *view* a case from using the browser's native print (Ctrl+P)
  or a screenshot - it removes the convenient affordances and the server-rendered PDF only.
- **Input validation:** request bodies are validated with Zod schemas
  (`insertCaseSchema` / `patchCaseSchema` `safeParse`) before use; CSV/XLSX exports apply
  formula-injection escaping (`server/routes/cases-export.ts`).
- **Sensitive admin actions are audit-logged** to `admin_action_logs`.

## 5. HTTP & network hardening

- **TLS:** the app runs as a single Node process **behind a reverse proxy (nginx/Caddy/PaaS)
  that terminates HTTPS**. `trust proxy` is set for correct client IPs behind one hop.
  See `docs/SERVER-DEPLOYMENT-GUIDE.md` for the nginx + Let's Encrypt setup.
- **Security headers:** Helmet is enabled, with an **explicit Content-Security-Policy in
  production** and `crossOriginResourcePolicy: same-site` (`server/index.ts`).
- **CORS:** the default deployment is **same-origin**, so no CORS headers are emitted and
  cross-origin browser calls are blocked by default. For split deployments set
  `CORS_ALLOWED_ORIGINS` to a **strict comma-separated allowlist** of exact origins - never
  a wildcard. A cross-origin preflight from a non-allowlisted origin is rejected with 403.
  Credentials mode is intentionally off (we use bearer tokens, not cookies).
- **Rate limiting** (`express-rate-limit`):
  - Strict bucket on credential endpoints (`/api/auth/login`, `/login/2fa`, `/signup`,
    `/password-reset-requests`, `/totp/verify`): **20 / 15 min per IP**,
    `skipSuccessfulRequests`.
  - Blanket bucket on all of `/api`: **1000 / 15 min per IP**.
- **No secret/PII leakage in responses:**
  - Response-body logging is **disabled in production** (PHI guard); `LOG_RESPONSE_BODIES`
    is ignored when `NODE_ENV=production`.
  - The error handler **never returns stack traces** to clients. In production, **5xx
    responses return a generic `"Internal Server Error"`** plus a `requestId`; the full
    message + stack is logged server-side for correlation. 4xx messages (intentional,
    user-facing) pass through.

## 6. DevTools / Network tab expectations

Browser network requests are inherently visible to an authenticated user - this cannot be
hidden, and that is expected. What matters is that everything visible is **safe to expose
to that authenticated user**:

- No API keys, service-role tokens, or third-party endpoints appear in requests or
  responses - the frontend only calls same-origin `/api/*`.
- The only credential visible is the user's **own** session bearer token (in the
  `Authorization` header of their own requests), which grants only their own permissions
  and can be revoked server-side.
- Payloads contain only data the signed-in user is authorized to see, gated by the
  capability checks in §4.

## 7. Known limitations / things to be aware of

- **Session token is now in an `httpOnly` cookie with CSRF protection** (see §4). JS can no
  longer read it, so XSS can no longer steal the session. Two operational notes: (1) the
  session/CSRF cookies are *session cookies* (no `Max-Age`), so fully closing the browser
  ends the client session - a deploy that wipes `sessions` or a server restart has the same
  effect, and users simply re-login; (2) `Secure` is only set when `NODE_ENV=production`, so
  the cookie requires HTTPS in production (already the case behind the reverse proxy) and
  works over plain HTTP only in local dev.
- **CORS allowlist is opt-in via env.** If you ever split the frontend onto a different
  origin and forget to set `CORS_ALLOWED_ORIGINS`, cross-origin calls will fail closed
  (safe), not open.
- **SQLite is single-instance.** Horizontal scaling / multiple app instances requires
  Postgres (`DB_PROVIDER=postgres`).
- **Backups may contain PHI.** Treat backup zips and any S3 bucket as sensitive; restrict
  bucket access and encrypt at rest.
- Rate limiting is **per-IP**; behind a proxy, ensure the proxy sets the real client IP so
  one hop doesn't collapse all clients into a single bucket (the single-hop `trust proxy`
  setting assumes exactly one proxy in front).

---

## 8. Production deployment checklist

Environment / secrets:

- [ ] `NODE_ENV=production`
- [ ] `ATTACHMENT_SIGNING_SECRET` set to a unique random value **≥ 32 chars** (boot fails otherwise)
- [ ] `PORT` set (default 5000) and matched by the reverse proxy
- [ ] Database configured: `DB_PROVIDER=sqlite` + absolute `DB_FILE`, **or**
      `DB_PROVIDER=postgres` + `DATABASE_URL`
- [ ] `ALLOW_DEFAULT_ADMIN=false` once the first real admin exists
- [ ] `HIDDEN_SUPERADMIN_ENABLED=false` unless genuinely needed (if enabled, password ≥ 16 chars, letters + digits)
- [ ] `CORS_ALLOWED_ORIGINS` left empty for same-origin, **or** set to the exact prod/staging origins for split deployments
- [ ] Absolute paths for `CASE_ATTACHMENTS_DIR` and `BACKUP_LOCAL_DIR`
- [ ] `LOG_RESPONSE_BODIES` unset / not `true` (ignored in prod regardless)
- [ ] Secrets injected via host secret store / systemd `EnvironmentFile`, never committed
- [ ] Confirm `.env*` are gitignored (already are)

Build & run:

- [ ] `npm ci`
- [ ] `npm run verify` (test + typecheck + build)
- [ ] `npm run build`
- [ ] Start under a supervisor: `npm run start` (or `npm run start:sqlite`) via systemd / PM2
- [ ] For the `/opt/vth-app` systemd layout, subsequent deploys: `sudo bash /opt/vth-app/scripts/deploy.sh`

Network / infra:

- [ ] Reverse proxy (nginx/Caddy/PaaS) terminates **HTTPS**; HTTP redirects to HTTPS
- [ ] Proxy forwards the real client IP (so per-IP rate limiting works)
- [ ] Firewall: only the proxy port is public; the Node `PORT` is not exposed directly
- [ ] Backups scheduled and stored off-host; backup storage access restricted

Post-deploy smoke tests:

- [ ] `GET /api/health` returns `ok`
- [ ] `GET /api/ready` returns `ready` (DB reachable)
- [ ] Log in, register a case, view it, export it (per role)
- [ ] Confirm DevTools Network shows only same-origin `/api/*` calls and no third-party secrets
