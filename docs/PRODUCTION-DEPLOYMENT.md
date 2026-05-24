# Production deployment checklist

This document is for **whoever deploys the app** (you, a colleague, or a vendor). You do not need to know the codebase in depth if you follow the steps below.

**Related docs:** `README.md` (architecture map), `docs/RELEASE.md` (release flow), `docs/OPERATIONS.md` (day‑to‑day ops), `.env.example` (variable names and comments).

---

## 1) Before you deploy

| Step | Action |
|------|--------|
| 1 | Take a **database backup** (and confirm the backup file exists). See `docs/RELEASE.md` §2 and `npm run backup:db` for SQLite. |
| 2 | On the build machine or CI image, use **Node 22** (or another version allowed by `package.json` `engines` and `.nvmrc`). |
| 3 | Install with **`npm ci`** on the server or in your build pipeline (reproducible lockfile). |
| 4 | Run **`npm run verify`** (tests + TypeScript + production bundle). Do not skip this on the branch you ship. |

---

## 2) Required configuration (production)

The **bundled** server (`npm run build` → `npm start` / `node dist/index.cjs`) **will not start** in production without the signing secret below. Set these in the process environment or in a `.env` file loaded by the host (the app loads `dotenv` at startup).

### Must set

| Variable | Why |
|----------|-----|
| **`NODE_ENV=production`** | Enables production middleware (e.g. Helmet CSP path), signing checks, and stricter behavior. |
| **`ATTACHMENT_SIGNING_SECRET`** | **At least 32 characters.** HMAC secret for time‑limited URLs used for **case attachment images** and **profile photos** (`<img>` cannot send auth headers). The server **exits on boot** if this is missing in production. Generate a long random string (password manager or `openssl rand -hex 32`). |
| **`PORT`** | Port the Node process listens on (default in `.env.example` is `5000`). Your reverse proxy must forward to this port. |

### Database (pick one path)

| Variable | When |
|----------|------|
| **`DB_PROVIDER=sqlite`** (default) | Single server instance; use **`DB_FILE`** as an **absolute path** to the SQLite file (e.g. `/var/lib/vth-app/data.db`). Ensure the service user can read/write the file and its directory. |
| **`DB_PROVIDER=postgres`** | Multi‑instance or managed DB; set **`DATABASE_URL`** (connection string). Apply migrations under `migrations-pg/` per your migration process (`server/migration-runner.ts` at startup). |

### Strongly recommended

| Variable | Why |
|----------|-----|
| **`ALLOW_DEFAULT_ADMIN=false`** | After the first real admin exists, keep this **false** so the emergency bootstrap account is not recreated. |
| **`DEFAULT_ADMIN_PASSWORD`** | Used only when the bootstrap admin is created (empty DB or `ALLOW_DEFAULT_ADMIN=true`). Must be **12+ chars** with letters and digits. If unset, the server generates a one-time random password and logs it once at startup — capture it from the log and rotate immediately. The legacy `admin123` default has been removed. |
| **`LOG_RESPONSE_BODIES`** | Ignored in production (response bodies are **never** logged when `NODE_ENV=production`). Useful only for local debugging. |
| **`WIPE_SESSIONS_ON_BOOT`** | Defaults to **wipe** — every server restart deletes all sessions, so every user must log in again. This is the safe posture for a clinic deployment. Set to `false` only if you want active sessions to survive deploys (only expired rows are pruned in that mode). |

### Paths (recommended absolute paths in production)

| Variable | Purpose |
|----------|---------|
| **`CASE_ATTACHMENTS_DIR`** | Directory for uploaded case images (default: `./uploads/case-attachments` under cwd). |
| **`BACKUP_LOCAL_DIR`** | Superadmin full‑site backup zip output (default: `./backups/site`). |

### Optional

| Variable | Purpose |
|----------|---------|
| **`ATTACHMENT_SIGNING_TTL_MS`** | Lifetime of signed image URLs in milliseconds (allowed range **60000–86400000**). Default **900000** (15 minutes). Signed URLs are now **user‑bound** — a URL issued to one user will not authorize another. |
| **S3 backup** | `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — only if you use remote backup upload from the Admin → Backup UI. |
| **`PG_BIN`** | Directory containing `pg_dump` / `psql` if they are not on `PATH` (Postgres site backup). |
| **Hidden superadmin** | `HIDDEN_SUPERADMIN_USERNAME` / `HIDDEN_SUPERADMIN_EMAIL` enable an optional break‑glass account. If enabled, **`HIDDEN_SUPERADMIN_PASSWORD` is required** and must be **16+ chars** with letters and digits — the server refuses to start otherwise. Document access control. |

---

## 3) Build and run

1. **`npm ci`** (clean install from lockfile).
2. **`npm run verify`** (or at minimum `npm run build` after `npm ci` in CI).
3. **`npm run start`** (or `npm run start:sqlite` if you rely on that script’s env defaults).

Run the process under **systemd**, **PM2**, Kubernetes, or your platform’s supervisor. There is **no Dockerfile** in this repository; add one if you standardize on containers.

---

## 4) Reverse proxy and TLS

- Terminate **HTTPS** at nginx, Caddy, a load balancer, or your PaaS.
- Forward to the Node **`PORT`**. The app sets **`trust proxy`** for one proxy hop so rate limits and logs see the real client IP when configured correctly.

---

## 5) After deploy (smoke test)

| Check | How |
|--------|-----|
| Process up | `GET /api/health` → JSON `status: ok` |
| Database reachable | `GET /api/ready` → `status: ready` (503 if DB fails) |
| User flow | Log in, open case list, open one case (images should load), log out |

---

## 6) Security and product notes (read once)

- **Sessions:** Every server restart **wipes all sessions** by default — users must log in again after a deploy or service restart. Set `WIPE_SESSIONS_ON_BOOT=false` to keep active sessions across restarts (only expired rows are pruned in that mode). Session `last_seen_at` is throttled to one write every 5 minutes per session.
- **Student exports:** Download approvals are **single‑use** and **range‑bound**. A student must pass `dateFrom`/`dateTo` that fall inside the approved BS window; the UI auto‑fills the picker with the approved range. The server consumes the approval atomically on the first successful export.
- **Attachment URLs:** Signed download URLs are bound to the issuing user (`uid` claim) and expire after 15 minutes by default (`ATTACHMENT_SIGNING_TTL_MS`).
- **Students:** The API restricts **student** users to cases they **registered** (`registered_by`). If your institution expects students to see **all** cases in a module, that is a product change—coordinate with development before go‑live.
- **Bootstrap admin:** Empty DB + non‑production (or `ALLOW_DEFAULT_ADMIN=true`) can create a default admin. If `DEFAULT_ADMIN_PASSWORD` is unset, a random password is printed once in the boot log — copy it and rotate. The old `admin123` default is gone.

### Migrations introduced in this release

| File | Purpose |
|------|---------|
| `migrations*/0014_medications_class.sql` | Adds `medication_class` column for the medication bulk import. |
| `migrations*/0015_case_counters.sql` | Adds the `case_counters` table and seeds it from existing cases. **Atomic** allocation of case numbers replaces the old `COUNT(*) + 1` race. |
| `migrations*/0016_foreign_keys.sql` | Cleans orphaned rows and adds FK constraints (Postgres) or triggers (SQLite) for `sessions`, `download_requests`, `password_reset_requests`, `case_change_logs`, and `case_attachments`. |

Run these against the production database **before** starting the new build (the startup migration runner applies them automatically, but verify with `npm run check:db` if you have it). Take a backup first.

---

## 7) Rollback

See **`docs/RELEASE.md` §5**: stop the app, restore the database from the pre‑deploy backup, redeploy the previous build, re‑run health checks.

---

## 8) CI expectation

GitHub Actions (`.github/workflows/ci.yml`) runs **`npm run verify`** and a **Knip** job for orphan files. Deploy only commits that pass CI on `main` (or your release branch).
