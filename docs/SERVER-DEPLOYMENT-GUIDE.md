# Server deployment guide (step by step)

This is a concrete walkthrough for deploying VTH-app to a **fresh Linux server**, with either **SQLite** (single instance, file-based) or **PostgreSQL** (recommended for production).

If you only need the *check-the-boxes* version, use [`docs/PRODUCTION-DEPLOYMENT.md`](./PRODUCTION-DEPLOYMENT.md). This document is the longer companion: every command, every file path, every config option, explained.

**Audience:** an engineer who has never seen this codebase before but is comfortable with Linux, SSH, and basic systemd / nginx.

---

## Table of contents

1. [What you are deploying](#1-what-you-are-deploying)
2. [Server requirements](#2-server-requirements)
3. [Provision the server (one-time)](#3-provision-the-server-one-time)
4. [Install Node.js 22 LTS](#4-install-nodejs-22-lts)
5. [Create the service user and directories](#5-create-the-service-user-and-directories)
6. [Get the source code](#6-get-the-source-code)
7. [Database setup — SQLite path](#7-database-setup--sqlite-path)
8. [Database setup — PostgreSQL path](#8-database-setup--postgresql-path)
9. [Configure environment variables](#9-configure-environment-variables)
10. [Install dependencies and build](#10-install-dependencies-and-build)
11. [First boot and admin bootstrap](#11-first-boot-and-admin-bootstrap)
12. [Run as a systemd service](#12-run-as-a-systemd-service)
13. [Reverse proxy and TLS (nginx + Let’s Encrypt)](#13-reverse-proxy-and-tls-nginx--lets-encrypt)
14. [Automated backups](#14-automated-backups)
15. [Day-2 operations](#15-day-2-operations)
16. [Upgrades and rollback](#16-upgrades-and-rollback)
17. [Troubleshooting](#17-troubleshooting)
18. [Quick reference (cheat sheet)](#18-quick-reference-cheat-sheet)

---

## 1) What you are deploying

VTH-app is a single Node.js process (Express 5) that:

- Serves a built React (Vite) frontend from `/`.
- Exposes a JSON API at `/api/*`.
- Stores data in **SQLite** (file on disk) **or** **PostgreSQL** (network database). Choose one at boot via `DB_PROVIDER`.
- Writes uploaded **case attachments** to a directory on disk (`CASE_ATTACHMENTS_DIR`).
- Writes optional **site backup zips** to a directory on disk (`BACKUP_LOCAL_DIR`).

The process listens on **`PORT`** (default `5000` for production). You front it with a reverse proxy (nginx, Caddy, or your PaaS edge) that terminates TLS and forwards to that port.

There is **no Dockerfile** in the repo today. If your team standardizes on containers, write one — the deploy steps below all translate cleanly.

---

## 2) Server requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB | 2 GB |
| Disk | 5 GB | 20 GB+ (case attachments grow over time) |
| OS | Ubuntu 22.04 / 24.04 LTS, Debian 12, RHEL 9 | Ubuntu 24.04 LTS |
| Network | A public DNS name pointing at the server (e.g. `vth.example.edu`) and ports `80` + `443` reachable | same |

The examples below assume **Ubuntu 24.04 LTS**. Translate `apt` to your distro's package manager as needed.

---

## 3) Provision the server (one-time)

```bash
# Log in as a sudo-capable user.
ssh ubuntu@vth.example.edu

# Update the system.
sudo apt update && sudo apt upgrade -y

# Install base tooling we’ll need throughout.
sudo apt install -y curl ca-certificates gnupg git ufw build-essential python3 sqlite3
```

Open the firewall for SSH, HTTP, and HTTPS only:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

The Node process itself listens on `PORT` (default `5000`) on `localhost` — **do not** open that port to the public. The reverse proxy (set up in step 13) is the only thing that should reach it.

---

## 4) Install Node.js 22 LTS

The repo pins Node 22 (`.nvmrc` and `package.json` `engines`). Use the NodeSource binary distribution:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node --version   # v22.x
npm --version
```

The native module **`better-sqlite3`** needs a C++ toolchain at install time. `build-essential` and `python3` (installed in step 3) cover this on Ubuntu/Debian.

---

## 5) Create the service user and directories

Running the Node process as a dedicated unprivileged user is one of the cheapest hardening wins.

```bash
# Create the system user (no shell, no home prompt).
sudo useradd --system --create-home --shell /usr/sbin/nologin vth-app

# Standard layout the rest of this guide assumes:
sudo install -d -o vth-app -g vth-app /opt/vth-app                    # app code
sudo install -d -o vth-app -g vth-app /var/lib/vth-app                # mutable data
sudo install -d -o vth-app -g vth-app /var/lib/vth-app/uploads        # case attachments
sudo install -d -o vth-app -g vth-app /var/lib/vth-app/backups        # site backup zips
sudo install -d -o vth-app -g vth-app /var/lib/vth-app/db-backups     # SQLite snapshots
sudo install -d -o vth-app -g vth-app /var/log/vth-app                # if you redirect stdout
```

Why split `/opt/vth-app` and `/var/lib/vth-app`?

- `/opt/vth-app` is the **read-mostly** application code (you redeploy on top of it).
- `/var/lib/vth-app` is the **state** — database files, uploads, backups. You **must** keep this across redeploys, and back it up.

---

## 6) Get the source code

You have two options. Pick one and stick with it.

### Option A — git pull on the server (simple)

```bash
sudo -u vth-app git clone https://github.com/YOUR_ORG/vth-app.git /opt/vth-app
cd /opt/vth-app
sudo -u vth-app git checkout main          # or whatever branch you ship from
```

### Option B — build on CI, copy artifact to server (recommended)

1. Run `npm ci && npm run verify` in CI (GitHub Actions, etc.) on a clean checkout.
2. Tar the build output (`dist/`, `client/dist/`, `package.json`, `package-lock.json`, `migrations/`, `migrations-pg/`, `node_modules/` produced by `npm ci --omit=dev`).
3. `scp` the tar to the server, extract into `/opt/vth-app/releases/<timestamp>/`, then symlink `/opt/vth-app/current` to the new release.

Option A is what most small institutional deployments use. Option B gives you cleaner rollbacks.

The rest of this guide assumes Option A and refers to `/opt/vth-app` as the project root.

---

## 7) Database setup — SQLite path

Use SQLite when:
- You run a **single** Node process.
- Your dataset is < ~50 GB.
- You can take the app offline briefly to back up the DB file.

```bash
# Decide on the canonical path. We use:
SQLITE_FILE=/var/lib/vth-app/data.db

# Touch the file with the right ownership so the app can create + write it.
sudo -u vth-app touch "$SQLITE_FILE"
```

You will reference this path as `DB_FILE` in the next step.

The schema is created automatically by the startup migration runner (`server/migration-runner.ts`). You do **not** need to run any SQL by hand on first boot.

If you need to inspect the DB later:

```bash
sudo -u vth-app sqlite3 /var/lib/vth-app/data.db ".tables"
```

Skip section 8 and continue at section 9.

---

## 8) Database setup — PostgreSQL path

Use PostgreSQL when:
- You run **multiple** app instances behind a load balancer.
- You want managed daily backups, point-in-time recovery, or replication.
- Your institution mandates a managed RDBMS.

### 8.1 Install Postgres

```bash
sudo apt install -y postgresql postgresql-client
sudo systemctl enable --now postgresql
psql --version
```

### 8.2 Create role, database, and credentials

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE vth_app WITH LOGIN PASSWORD 'CHANGE_ME_TO_A_STRONG_RANDOM_STRING';
CREATE DATABASE vth_app OWNER vth_app ENCODING 'UTF8';
GRANT ALL PRIVILEGES ON DATABASE vth_app TO vth_app;
SQL
```

Verify the credentials by connecting as the new role:

```bash
PGPASSWORD='CHANGE_ME_TO_A_STRONG_RANDOM_STRING' \
  psql -h 127.0.0.1 -U vth_app -d vth_app -c 'SELECT current_database();'
```

### 8.3 Build the connection string

The app expects a standard URL:

```
DATABASE_URL=postgres://vth_app:CHANGE_ME_TO_A_STRONG_RANDOM_STRING@127.0.0.1:5432/vth_app
```

If your Postgres is on another host, swap `127.0.0.1` for that host and confirm `pg_hba.conf` accepts the connection (`host vth_app vth_app <CIDR> scram-sha-256`).

### 8.4 Site backup tooling

The Admin → Backup UI shells out to `pg_dump` / `psql` for full-site backups. If those binaries are not on `PATH` for the `vth-app` user, set:

```
PG_BIN=/usr/lib/postgresql/16/bin
```

(Adjust the version number to whatever `pg_config --bindir` reports.)

Migrations under `migrations-pg/` are applied automatically at boot.

---

## 9) Configure environment variables

Create `/opt/vth-app/.env` (the app loads it via `dotenv`):

```bash
sudo -u vth-app cp /opt/vth-app/.env.example /opt/vth-app/.env
sudo chmod 600 /opt/vth-app/.env
sudo chown vth-app:vth-app /opt/vth-app/.env
```

Open it and set the values below. **All paths should be absolute in production.**

### 9.1 Required

```ini
NODE_ENV=production
PORT=5000

# 32+ random chars. Generate with: openssl rand -hex 32
ATTACHMENT_SIGNING_SECRET=REPLACE_WITH_32_PLUS_CHAR_RANDOM_HEX

# SQLite path
DB_PROVIDER=sqlite
DB_FILE=/var/lib/vth-app/data.db

# --- OR --- Postgres path
# DB_PROVIDER=postgres
# DATABASE_URL=postgres://vth_app:STRONG_PASSWORD@127.0.0.1:5432/vth_app
# PG_BIN=/usr/lib/postgresql/16/bin
```

### 9.2 Storage paths

```ini
CASE_ATTACHMENTS_DIR=/var/lib/vth-app/uploads
BACKUP_LOCAL_DIR=/var/lib/vth-app/backups
DB_BACKUP_DIR=/var/lib/vth-app/db-backups
```

### 9.3 Bootstrap admin

The first time the database is empty, the app creates a `superadmin` user named `admin`. Set the password explicitly so you don’t have to fish it out of the boot log:

```ini
ALLOW_DEFAULT_ADMIN=true
DEFAULT_ADMIN_PASSWORD=SomethingStrong_With_Letters_And_Digits_123
```

After the first successful login, **either** flip `ALLOW_DEFAULT_ADMIN=false` **or** create a new admin and delete the `admin` user. Leaving the bootstrap path enabled long-term is a documented security risk.

If `DEFAULT_ADMIN_PASSWORD` is unset, the app generates one random password and prints it once at boot — copy it from the systemd log (`journalctl -u vth-app`) and rotate immediately.

### 9.4 Optional break-glass account

```ini
HIDDEN_SUPERADMIN_ENABLED=false
# If enabled, ALL of these must be set, and PASSWORD must be 16+ chars w/ letters and digits.
# HIDDEN_SUPERADMIN_USERNAME=system_superadmin
# HIDDEN_SUPERADMIN_EMAIL=system.superadmin@vth.example.edu
# HIDDEN_SUPERADMIN_PASSWORD=ALongStrongPassword12345
```

In production the server **refuses to start** if `HIDDEN_SUPERADMIN_ENABLED=true` and the password doesn't meet the policy.

### 9.5 Optional S3 backup upload

If you want the Admin → Backup → Upload to S3 feature:

```ini
BACKUP_S3_BUCKET=vth-app-backups
BACKUP_S3_PREFIX=site-backups
BACKUP_S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
```

### 9.6 Misc tunables (rarely changed)

```ini
# Lifetime of signed image URLs (60_000 – 86_400_000 ms). Default 900_000 (15 min).
# ATTACHMENT_SIGNING_TTL_MS=900000

# Session pruning behaviour on boot.
# Default (unset or any value other than "false"): WIPE all sessions on every
# restart, so users must log in again after a deploy/restart. This is the safe
# posture for a clinic deployment. Set to "false" only if you want active
# sessions to survive restarts (handy on a dev machine).
# WIPE_SESSIONS_ON_BOOT=false

# Cleanup of orphaned temp uploads (defaults are fine for most installs).
# TEMP_ATTACHMENTS_MAX_AGE_HOURS=72
# TEMP_ATTACHMENTS_CLEANUP_INTERVAL_MS=21600000

# Response-body logging is IGNORED in production — never set this true on a real install.
LOG_RESPONSE_BODIES=false
```

Save the file. Verify permissions: `ls -l /opt/vth-app/.env` should report `-rw------- 1 vth-app vth-app`.

---

## 10) Install dependencies and build

```bash
cd /opt/vth-app

# Reproducible install (uses package-lock.json):
sudo -u vth-app npm ci

# Type-check, run tests, build the production bundle:
sudo -u vth-app npm run verify
```

`npm run verify` is the same gate CI runs. If anything fails here, **stop** and fix it before going further — the production bundle is `dist/index.cjs` and is created by this step.

A successful build leaves:

- `dist/index.cjs` — the bundled Node server.
- `client/dist/` — the built React assets (served by the Node process).

---

## 11) First boot and admin bootstrap

Smoke-test the build by running it once in the foreground:

```bash
cd /opt/vth-app
sudo -u vth-app -E env $(cat .env | xargs) node dist/index.cjs
```

Watch the log. You should see:

- `[sessions]` — no warning (default is "prune expired only").
- Either `[BOOTSTRAP] Created superadmin username="admin" with one-time password: ...` (if you didn’t set `DEFAULT_ADMIN_PASSWORD`) or no bootstrap line at all (DB already had users).
- `serving on port 5000`.

Hit the health endpoints from another shell:

```bash
curl http://127.0.0.1:5000/api/health   # {"status":"ok"}
curl http://127.0.0.1:5000/api/ready    # {"status":"ready"}
```

Then `Ctrl+C` to stop the foreground run — we’re about to turn it into a service.

---

## 12) Run as a systemd service

Create `/etc/systemd/system/vth-app.service`:

```ini
[Unit]
Description=VTH-app (Veterinary Teaching Hospital case manager)
After=network-online.target
Wants=network-online.target
# Uncomment if running Postgres on the same host:
# After=postgresql.service
# Requires=postgresql.service

[Service]
Type=simple
User=vth-app
Group=vth-app
WorkingDirectory=/opt/vth-app
EnvironmentFile=/opt/vth-app/.env
ExecStart=/usr/bin/node /opt/vth-app/dist/index.cjs

# Hardening: keep the process boxed in.
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/vth-app /var/log/vth-app
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
MemoryDenyWriteExecute=true

# Resource ceilings (tune to your VM):
LimitNOFILE=4096
TasksMax=200

Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now vth-app
sudo systemctl status vth-app
```

Tail the live log:

```bash
sudo journalctl -u vth-app -f
```

If the service refuses to start, common causes are listed in [Troubleshooting](#17-troubleshooting).

---

## 13) Reverse proxy and TLS (nginx + Let’s Encrypt)

The Node process listens on `127.0.0.1:5000`. We front it with nginx and obtain a TLS certificate from Let’s Encrypt.

### 13.1 Install nginx and certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo systemctl enable --now nginx
```

### 13.2 Server block

Create `/etc/nginx/sites-available/vth-app.conf`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vth.example.edu;

    # certbot will rewrite this to TLS in a moment.
    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;

        # Large uploads (case attachments). Tune to your max upload size.
        client_max_body_size 25m;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/vth-app.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 13.3 Issue the TLS certificate

```bash
sudo certbot --nginx -d vth.example.edu --redirect --agree-tos -m ops@example.edu --no-eff-email
```

Certbot will rewrite the server block to listen on `443` with HTTP→HTTPS redirect, and schedule auto-renewal via a systemd timer (`certbot.timer`).

Verify:

```bash
curl -I https://vth.example.edu/api/health
# HTTP/2 200
```

The Node app calls `app.set('trust proxy', 1)` so rate limits and logged client IPs honor the nginx `X-Forwarded-For` header. Don't chain multiple proxies without bumping the `trust proxy` count.

---

## 14) Automated backups

You **must** back up two things:

1. The **database** — either the SQLite file or a `pg_dump` of the Postgres DB.
2. The **uploads directory** (`CASE_ATTACHMENTS_DIR`) — those files are referenced by rows in the DB and cannot be reconstructed.

### 14.1 SQLite — nightly snapshots via cron

The repo ships a script that uses `.backup` (atomic) instead of `cp` (not safe while the DB is open):

```bash
# Test once by hand.
sudo -u vth-app -E DB_FILE=/var/lib/vth-app/data.db \
    DB_BACKUP_DIR=/var/lib/vth-app/db-backups \
    npx --prefix /opt/vth-app tsx /opt/vth-app/script/backup-db.ts
ls -lh /var/lib/vth-app/db-backups/
```

Then schedule it. Create `/etc/cron.d/vth-app-backup`:

```cron
# Nightly at 02:30 server time. Keep ~30 days; the script names files by timestamp.
30 2 * * * vth-app cd /opt/vth-app && DB_FILE=/var/lib/vth-app/data.db DB_BACKUP_DIR=/var/lib/vth-app/db-backups /usr/bin/npx tsx script/backup-db.ts >> /var/log/vth-app/backup.log 2>&1

# Weekly: prune backups older than 30 days.
0 3 * * 0 vth-app find /var/lib/vth-app/db-backups -name 'data-*.db' -mtime +30 -delete
```

Also rsync `/var/lib/vth-app/uploads` and `/var/lib/vth-app/db-backups` to off-host storage (S3, another VM, an institutional NAS). The Admin → Backup → Upload to S3 feature handles the **full-site** zip if you configured S3 in step 9.5.

### 14.2 Postgres — nightly dump

```cron
30 2 * * * vth-app PGPASSWORD='STRONG_PASSWORD' /usr/bin/pg_dump -h 127.0.0.1 -U vth_app -F c -f /var/lib/vth-app/db-backups/vth_app-$(date +\%F).dump vth_app >> /var/log/vth-app/backup.log 2>&1
0  3 * * 0 vth-app find /var/lib/vth-app/db-backups -name 'vth_app-*.dump' -mtime +30 -delete
```

Test recovery (in a staging environment, **not** production):

```bash
createdb vth_app_restore
pg_restore -h 127.0.0.1 -U vth_app -d vth_app_restore /var/lib/vth-app/db-backups/vth_app-YYYY-MM-DD.dump
```

A backup you have never restored is not a backup.

### 14.3 Site-level backup (full ZIP)

The app has its own **Admin → Backup** UI for superadmins that produces a single ZIP containing the DB dump + uploads. It writes to `BACKUP_LOCAL_DIR` and optionally uploads to S3. Use it before big upgrades and treat it as your "Rollback insurance".

The restore endpoint requires typing the confirmation phrase `RESTORE_SITE_DATA` exactly — that is by design.

---

## 15) Day-2 operations

### Health checks

```bash
curl https://vth.example.edu/api/health    # process up?
curl https://vth.example.edu/api/ready     # DB reachable?
```

Hook these into your uptime monitor (UptimeRobot, BetterStack, Pingdom, institutional Nagios, etc.).

### Logs

```bash
sudo journalctl -u vth-app -f                    # live
sudo journalctl -u vth-app --since "1 hour ago"  # recent
sudo journalctl -u vth-app -p err --since today  # errors only
```

Every API request is logged as a JSON line tagged `"type":"api_request"`. Every export is also logged with row counts.

### Restart / reload

```bash
sudo systemctl restart vth-app
```

Every server restart wipes all sessions by default — users must log in again after a deploy/restart. Set `WIPE_SESSIONS_ON_BOOT=false` if you want active sessions to survive restarts (only expired sessions are pruned in that mode).

### Watch resource usage

```bash
sudo systemctl status vth-app   # memory + CPU
htop                            # full process tree
df -h /var/lib/vth-app          # disk for DB + uploads
```

---

## 16) Upgrades and rollback

### 16.1 Standard upgrade

```bash
# On the server, in /opt/vth-app:
sudo -u vth-app git fetch
sudo -u vth-app git checkout <new-tag-or-commit>
sudo -u vth-app npm ci
sudo -u vth-app npm run verify     # build + tests + typecheck
sudo systemctl restart vth-app
sudo journalctl -u vth-app -f      # watch boot logs for migration output
```

The migration runner applies any new SQL files in `migrations/` (SQLite) or `migrations-pg/` (Postgres) on the next boot. Already-applied IDs are tracked in `schema_migrations`.

### 16.2 Rollback

```bash
# 1. Stop the service so the DB is consistent.
sudo systemctl stop vth-app

# 2. Restore the database from the pre-upgrade backup.
#    SQLite:
sudo -u vth-app cp /var/lib/vth-app/db-backups/data-YYYYMMDD-HHMM.db /var/lib/vth-app/data.db
#    Postgres:
# sudo -u vth-app PGPASSWORD='...' pg_restore -h 127.0.0.1 -U vth_app -d vth_app --clean --if-exists \
#   /var/lib/vth-app/db-backups/vth_app-YYYY-MM-DD.dump

# 3. Check out the previous commit.
cd /opt/vth-app
sudo -u vth-app git checkout <previous-tag-or-commit>
sudo -u vth-app npm ci
sudo -u vth-app npm run build

# 4. Restart and re-verify.
sudo systemctl start vth-app
curl https://vth.example.edu/api/health
```

There is no automatic "down migration". Migrations are **forward only**; rolling back means restoring the DB from a backup taken before the offending migration ran.

---

## 17) Troubleshooting

### `systemctl status vth-app` shows `(code=exited, status=1/FAILURE)`

```bash
sudo journalctl -u vth-app -n 100 --no-pager
```

Look for the first `Error:` line. Common ones:

| Symptom | Cause | Fix |
|---------|-------|-----|
| `ATTACHMENT_SIGNING_SECRET must be set ...` | env var missing/too short | Generate 32+ chars and put in `.env`. |
| `HIDDEN_SUPERADMIN_ENABLED=true requires HIDDEN_SUPERADMIN_PASSWORD ...` | hidden account enabled without strong password | Either set the password or set `HIDDEN_SUPERADMIN_ENABLED=false`. |
| `EADDRINUSE: address already in use 0.0.0.0:5000` | Another process or another copy is on the port | `sudo ss -tlnp | grep 5000` to find it; `systemctl stop` the duplicate. |
| `better-sqlite3 native binary does not match ...` | Node version changed under the existing `node_modules` | `cd /opt/vth-app && sudo -u vth-app npm rebuild better-sqlite3`. |
| `Failed to run the query 'CREATE TRIGGER ...'` | (Old build) Migration splitter bug — fixed in the SQL statement splitter added in May 2026. Pull latest code. | `git pull && npm ci && npm run build && systemctl restart vth-app`. |
| `connect ECONNREFUSED 127.0.0.1:5432` | Postgres not running or wrong port | `sudo systemctl status postgresql`; verify `DATABASE_URL`. |

### 502 Bad Gateway from nginx

The Node process isn’t reachable on `127.0.0.1:5000`.

```bash
sudo systemctl status vth-app
sudo ss -tlnp | grep 5000
```

If the service is up but on a different port, fix `PORT` in `/opt/vth-app/.env` (and the `proxy_pass` line in nginx if you changed it).

### Login works but every other request returns 401

Bearer tokens are stored in `sessionStorage` (per-tab). The server's default behaviour is to wipe all sessions on every restart, so any restart of the service requires every user to log in again. (Set `WIPE_SESSIONS_ON_BOOT=false` to opt out.)

### Images don’t load (broken thumbnails in case view)

Attachment URLs are signed and user-bound (`uid` claim) and expire after `ATTACHMENT_SIGNING_TTL_MS` (default 15 min). Refresh the page to get fresh URLs. If they still fail, check that `CASE_ATTACHMENTS_DIR` exists and the `vth-app` user has read access.

### Disk filling up

```bash
du -sh /var/lib/vth-app/*
```

- `db-backups/` — prune older than 30 days (see step 14).
- `backups/` — superadmin full-site zips; clear from the Admin UI or `rm` files older than your retention policy.
- `uploads/` — case attachments. Don't blindly delete; cross-reference with the `case_attachments` table first.

### Need to reset the admin password

Use the **Forgot password** link on the login screen (it submits a request that any other admin can approve via Admin → Password Resets). If no other admin exists, you have two options:

1. **Hidden superadmin** (if you enabled it in step 9.4) — log in with it and reset the locked-out admin.
2. **Manual DB reset** (last resort). Generate a bcrypt hash and update the row:
   ```bash
   sudo systemctl stop vth-app
   node -e "console.log(require('bcryptjs').hashSync('NEW_PASSWORD_HERE', 10))"
   # Paste the hash:
   sudo -u vth-app sqlite3 /var/lib/vth-app/data.db \
     "UPDATE users SET password_hash='<HASH>', failed_login_attempts=0, locked_until=NULL WHERE username='admin';"
   sudo systemctl start vth-app
   ```
   (For Postgres, run the equivalent `UPDATE` via `psql`.)

---

## 18) Quick reference (cheat sheet)

| Task | Command |
|------|---------|
| Tail logs | `sudo journalctl -u vth-app -f` |
| Restart | `sudo systemctl restart vth-app` |
| Stop | `sudo systemctl stop vth-app` |
| Service config | `/etc/systemd/system/vth-app.service` |
| App config | `/opt/vth-app/.env` |
| SQLite DB | `/var/lib/vth-app/data.db` |
| Uploads | `/var/lib/vth-app/uploads/` |
| Site backups | `/var/lib/vth-app/backups/` |
| DB backups | `/var/lib/vth-app/db-backups/` |
| nginx vhost | `/etc/nginx/sites-available/vth-app.conf` |
| Reload nginx | `sudo nginx -t && sudo systemctl reload nginx` |
| Renew TLS | `sudo certbot renew --dry-run` (timer runs the real one) |
| Backup DB now (SQLite) | `sudo -u vth-app DB_FILE=/var/lib/vth-app/data.db DB_BACKUP_DIR=/var/lib/vth-app/db-backups npx tsx /opt/vth-app/script/backup-db.ts` |
| Backup DB now (Postgres) | `sudo -u vth-app PGPASSWORD=... pg_dump -h 127.0.0.1 -U vth_app -F c vth_app > /var/lib/vth-app/db-backups/vth_app-now.dump` |
| Health | `curl https://vth.example.edu/api/health` |
| Ready (DB up) | `curl https://vth.example.edu/api/ready` |

---

**Related docs:** [`docs/PRODUCTION-DEPLOYMENT.md`](./PRODUCTION-DEPLOYMENT.md) (short checklist), [`docs/OPERATIONS.md`](./OPERATIONS.md) (day-to-day ops), [`docs/RELEASE.md`](./RELEASE.md) (release flow), [`README.md`](../README.md) (architecture map and code tour).
