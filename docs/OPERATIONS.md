## See also

- **`docs/PRODUCTION-DEPLOYMENT.md`** — checklist for anyone doing a **production** deploy (required env vars, order of operations, smoke tests, rollback).
- **`scripts/deploy.sh`** — one-command deploy for the Linux/systemd layout (DigitalOcean Droplet or any single-VM install at `/opt/vth-app`). Runs `git pull`, `npm ci`, and `npm run build` as the `vth-app` user, then restarts the service and confirms it is healthy. `sudo bash /opt/vth-app/scripts/deploy.sh --help` lists all flags.

## Deploy / upgrade

For the DigitalOcean Droplet and equivalent single-VM systemd installs:

```bash
sudo bash /opt/vth-app/scripts/deploy.sh             # normal deploy
sudo bash /opt/vth-app/scripts/deploy.sh --verify    # tests + typecheck + build
sudo bash /opt/vth-app/scripts/deploy.sh --branch hotfix
sudo bash /opt/vth-app/scripts/deploy.sh --no-restart
```

What it does (in order):

1. Confirms it is running as root and that the `vth-app` user exists.
2. **Self-heals** ownership of `/opt/vth-app` back to `vth-app:vth-app` if a previous deploy was accidentally run as root.
3. `git fetch`, `git checkout <branch>`, `git pull --ff-only` — all as `vth-app`.
4. `npm ci` then `npm run build` (or `npm run verify` with `--verify`) — all as `vth-app`.
5. `systemctl restart vth-app`, waits, checks `is-active`. If the service is not Active 3 seconds later, dumps the last 40 log lines and exits non-zero.
6. Tails the last 20 lines of `journalctl -u vth-app` so you immediately see migrations applying and `serving on port 5000`.

Exit codes: `0` success · `1` pre-flight failure · `2` git/npm/build failure · `3` service failed to come up.

For PaaS or container deployments where there is no `/opt/vth-app` or systemd, use `npm ci && npm run verify && npm run start` under your platform's process supervisor as described in `docs/PRODUCTION-DEPLOYMENT.md`.

## Runtime health endpoints

- `GET /api/health`
  - Liveness endpoint
  - Returns service status and uptime
- `GET /api/ready`
  - Readiness endpoint
  - Validates DB connectivity

Use `health` for process checks and `ready` for traffic routing.

## Logging

- API requests are logged in structured JSON with:
  - `requestId`, `method`, `path`, `statusCode`, `durationMs`
  - `type=api_request`
- API errors are logged in structured JSON with:
  - `requestId`, `status`, `message`, `path`, `method`
  - `type=api_error`
- Startup logs include active DB path.
- Every API response includes `x-request-id` header.
- Review logs after deploy for:
  - repeated 5xx responses
  - readiness failures
  - abnormal response times

## Persistence and storage

- Data is stored in SQLite file at `DB_FILE`.
- Ensure `DB_FILE` points to persistent disk/volume.
- Keep WAL files alongside DB file (`*.db-wal`, `*.db-shm`).

### Intentional auth behavior

- Sessions are intentionally cleared on every server startup.
- Result: all users (including admins/superadmins) must log in again after restart.
- This is expected behavior, not an outage condition.

- Client auth token uses tab-scoped storage (`sessionStorage`):
  - page reload in same tab keeps login
  - closing tab/window ends login
- Inactivity auto-logout is intentionally enabled and user-configurable.

## Backup operations

- Backup: `npm run backup:db`
- Restore:
  - `cross-env DB_FILE=./data.db DB_RESTORE_FROM=./backups/<file>.db npm run restore:db`

Run backups with app stopped for highest consistency.

### Recommended backup schedule

- Production: at least daily backups with 14+ days retention.
- Before releases/migrations: run an on-demand backup.
- Monthly: perform a restore drill in a non-production environment.

### Restore validation checklist

1. Restore DB to a test environment.
2. Verify `GET /api/health` and `GET /api/ready`.
3. Validate login + key admin/case flows.
4. Compare record counts for core tables (`users`, `cases`, `breakpoints`).
5. Record drill date/outcome in ops notes.

## Incident response quick steps

1. Check `GET /api/health`
2. Check `GET /api/ready`
3. Verify DB path from startup log
4. If DB corruption suspected, restore latest backup
5. Re-verify core flows and endpoints

## Capacity planning note

Current setup is suitable for single-instance deployment.
For high-scale usage, plan migration to managed Postgres + shared infra.

## API pagination

Heavy list endpoints support optional pagination query params:

- `page` (1-based)
- `pageSize` (default 50, max 200)
- or `paginated=true`

Supported endpoints:

- `GET /api/cases`
- `GET /api/admin/users`
- `GET /api/admin/users/pending`
- `GET /api/admin/download-requests`
- `GET /api/admin/password-reset-requests`
