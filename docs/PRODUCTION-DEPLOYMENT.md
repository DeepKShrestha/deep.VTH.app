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
| **`LOG_RESPONSE_BODIES=false`** | If `true` in production, API **response bodies may be logged** (risk of **PHI** in logs). Only enable briefly for debugging. |

### Paths (recommended absolute paths in production)

| Variable | Purpose |
|----------|---------|
| **`CASE_ATTACHMENTS_DIR`** | Directory for uploaded case images (default: `./uploads/case-attachments` under cwd). |
| **`BACKUP_LOCAL_DIR`** | Superadmin full‑site backup zip output (default: `./backups/site`). |

### Optional

| Variable | Purpose |
|----------|---------|
| **`ATTACHMENT_SIGNING_TTL_MS`** | Lifetime of signed image URLs in milliseconds (allowed range **60000–86400000**). Default **1800000** (30 minutes). |
| **S3 backup** | `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`, `BACKUP_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` — only if you use remote backup upload from the Admin → Backup UI. |
| **`PG_BIN`** | Directory containing `pg_dump` / `psql` if they are not on `PATH` (Postgres site backup). |
| **Hidden superadmin** | `HIDDEN_SUPERADMIN_*` — optional break‑glass account; see `.env.example`. If enabled, use a **strong** password and document access control. |

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

- **Sessions (SQLite):** On SQLite, a **server restart clears all sessions**; users must log in again. Plan maintenance windows accordingly.
- **Students:** The API restricts **student** users to cases they **registered** (`registered_by`). If your institution expects students to see **all** cases in a module, that is a product change—coordinate with development before go‑live.
- **Bootstrap admin:** Empty DB + non‑production (or `ALLOW_DEFAULT_ADMIN=true`) can create a default admin; **rotate credentials** before production use. See `README.md` §1.

---

## 7) Rollback

See **`docs/RELEASE.md` §5**: stop the app, restore the database from the pre‑deploy backup, redeploy the previous build, re‑run health checks.

---

## 8) CI expectation

GitHub Actions (`.github/workflows/ci.yml`) runs **`npm run verify`** and a **Knip** job for orphan files. Deploy only commits that pass CI on `main` (or your release branch).
