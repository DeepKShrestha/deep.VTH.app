# Release Runbook

This runbook is for safe production releases.

## 1) Pre-release checks

- Pull latest `main`.
- Install deps: `npm ci`
- Run verification: `npm run verify`
- Run dependency audit review: `npm run audit:deps`

## 2) Backup before deploy

- Create DB backup:
  - `npm run backup:db`
- Confirm backup file exists in `backups/`.

## 3) Deploy

- **Full production checklist (required env, smoke tests, rollback):** `docs/PRODUCTION-DEPLOYMENT.md` - use this for handoff to anyone who deploys without reading the whole README.
- Ensure env vars are set (minimum):
  - `NODE_ENV=production`
  - `PORT=5000` (or platform port)
  - `DB_FILE=/absolute/path/to/data.db` (SQLite) **or** `DB_PROVIDER=postgres` + `DATABASE_URL`
  - **`ATTACHMENT_SIGNING_SECRET`** - at least 32 characters; **required** or the production server exits on startup
  - `ALLOW_DEFAULT_ADMIN=false`
- **Linux/systemd install (DigitalOcean Droplet, single-VM):**
  - One command: `sudo bash /opt/vth-app/scripts/deploy.sh` (add `--verify` to also run tests + typecheck). The script runs `git pull`, `npm ci`, and `npm run build` as the `vth-app` user, restarts the service, and confirms it is healthy. See `docs/OPERATIONS.md` for full flags.
- **Other platforms (PaaS, containers, manual):**
  - `npm ci`
  - `npm run build`
  - `npm run start` (under your platform's process supervisor)

## 4) Post-deploy validation

- Check liveness: `GET /api/health`
- Check readiness: `GET /api/ready`
- Validate core user flow:
  - login
  - register case
  - view case list
  - export data

## 5) Rollback

- Stop app.
- Restore DB from backup:
  - `cross-env DB_FILE=./data.db DB_RESTORE_FROM=./backups/<file>.db npm run restore:db`
- Restart last known good release.
- Re-check `/api/health` and `/api/ready`.

## 6) Notes

- Never deploy without a fresh backup.
- Keep at least 7-14 rolling backups.
- For multi-instance scale, migrate to managed Postgres.
