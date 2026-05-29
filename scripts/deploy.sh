#!/usr/bin/env bash
#
# vth-app deploy script.
#
# Idempotent deploy for the DigitalOcean Droplet layout documented in
# docs/DIGITALOCEAN-DEPLOYMENT.md. Always runs git/npm as the `vth-app`
# system user so root never touches /opt/vth-app and you cannot trip
# Git's "dubious ownership" check or end up with root-owned node_modules.
#
# Usage (run as root, or via sudo):
#   sudo bash /opt/vth-app/scripts/deploy.sh                   # main, build, restart
#   sudo bash /opt/vth-app/scripts/deploy.sh --branch hotfix    # different branch
#   sudo bash /opt/vth-app/scripts/deploy.sh --verify           # also run tests + typecheck
#   sudo bash /opt/vth-app/scripts/deploy.sh --no-restart       # build only, no systemctl
#   sudo bash /opt/vth-app/scripts/deploy.sh --no-tail          # skip post-restart journalctl peek
#
# Exit codes:
#   0 = success and service is Active (or build-only ran clean)
#   1 = pre-flight failure (wrong dir, wrong OS user, etc.)
#   2 = git / npm / build failure
#   3 = service failed to come up healthy after restart

set -euo pipefail

APP_DIR="${APP_DIR:-/opt/vth-app}"
APP_USER="${APP_USER:-vth-app}"
APP_GROUP="${APP_GROUP:-vth-app}"
SERVICE_NAME="${SERVICE_NAME:-vth-app}"
BRANCH="main"
DO_RESTART=1
DO_VERIFY=0
DO_TAIL=1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)     BRANCH="${2:?--branch requires a value}"; shift 2 ;;
    --no-restart) DO_RESTART=0; shift ;;
    --verify)     DO_VERIFY=1; shift ;;
    --no-tail)    DO_TAIL=0; shift ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit "${2:-1}"; }

# --- pre-flight ----------------------------------------------------------

if [[ $EUID -ne 0 ]]; then
  die "Run as root (or via sudo). systemctl restart needs it." 1
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  die "System user '$APP_USER' does not exist. See docs/DIGITALOCEAN-DEPLOYMENT.md Phase 3." 1
fi

if [[ ! -d "$APP_DIR/.git" ]]; then
  die "$APP_DIR is not a git checkout. Clone first per the deployment guide." 1
fi

# Fix the exact failure that motivated this script: if /opt/vth-app got
# touched by root (or anyone else) the ownership drifts, git refuses to
# operate ("dubious ownership"), and a later `npm ci` writes root-owned
# node_modules that the service user can't delete. Re-chown is cheap and
# safe — we only ever expect this directory tree to belong to vth-app.
current_owner="$(stat -c '%U' "$APP_DIR")"
if [[ "$current_owner" != "$APP_USER" ]]; then
  warn "$APP_DIR is owned by '$current_owner', expected '$APP_USER'. Fixing ownership recursively."
  chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"
  ok   "Ownership reset to $APP_USER:$APP_GROUP."
fi

as_app() { sudo -u "$APP_USER" -H bash -lc "$*"; }

# --- git ----------------------------------------------------------------

step "git: fetching $BRANCH"
before_sha="$(as_app "cd '$APP_DIR' && git rev-parse --short HEAD")"
as_app "cd '$APP_DIR' && git fetch --tags origin" \
  || die "git fetch failed" 2
as_app "cd '$APP_DIR' && git checkout '$BRANCH'" \
  || die "git checkout $BRANCH failed" 2
as_app "cd '$APP_DIR' && git pull --ff-only origin '$BRANCH'" \
  || die "git pull --ff-only failed (your branch has diverged; resolve manually)." 2
after_sha="$(as_app "cd '$APP_DIR' && git rev-parse --short HEAD")"

if [[ "$before_sha" == "$after_sha" ]]; then
  ok "Already on $after_sha — no new commits."
else
  ok "Updated $before_sha → $after_sha"
  as_app "cd '$APP_DIR' && git log --oneline '${before_sha}..${after_sha}'" || true
fi

# --- install + build ----------------------------------------------------

step "npm ci"
as_app "cd '$APP_DIR' && npm ci" || die "npm ci failed" 2

if [[ $DO_VERIFY -eq 1 ]]; then
  step "npm run verify (tests + typecheck + build)"
  as_app "cd '$APP_DIR' && npm run verify" || die "npm run verify failed" 2
else
  step "npm run build"
  as_app "cd '$APP_DIR' && npm run build" || die "npm run build failed" 2
fi

# --- restart ------------------------------------------------------------

if [[ $DO_RESTART -eq 0 ]]; then
  ok "Build complete. Skipping restart (--no-restart)."
  exit 0
fi

step "systemctl restart $SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

# Wait briefly then check health. systemd reports Active=active even
# during early boot, so we tolerate a couple of seconds before failing.
sleep 3
if ! systemctl is-active --quiet "$SERVICE_NAME"; then
  warn "Service is not Active. Last 40 log lines:"
  journalctl -u "$SERVICE_NAME" -n 40 --no-pager || true
  die "$SERVICE_NAME failed to start." 3
fi
ok "$SERVICE_NAME is Active."

if [[ $DO_TAIL -eq 1 ]]; then
  step "journalctl -u $SERVICE_NAME -n 20"
  journalctl -u "$SERVICE_NAME" -n 20 --no-pager || true
fi

ok "Deploy complete (${before_sha} → ${after_sha})."
