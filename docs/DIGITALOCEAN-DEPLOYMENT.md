# DigitalOcean deployment — beginner guide

This is a complete, no-prior-experience walkthrough for deploying VTH-app to a fresh DigitalOcean Droplet with their Managed Postgres database. Designed for the **comfortable $29/mo setup**, sized for a pilot with fewer than 20 users.

> If you've already done a Linux deployment before, you probably want the shorter [`SERVER-DEPLOYMENT-GUIDE.md`](./SERVER-DEPLOYMENT-GUIDE.md) instead. This document repeats some of that content with extra explanation aimed at first-time deployers.

---

## What you're building

```
                Internet
                   │
                   ▼
        ┌──────────────────────┐
        │  Your domain name    │   (optional, but recommended)
        │  e.g. vth.iaas.edu   │
        └──────────┬───────────┘
                   │ HTTPS (port 443)
                   ▼
        ┌──────────────────────┐
        │  Droplet (Ubuntu)    │   $12/mo · 2 GB RAM · 50 GB SSD
        │  ─────────────────   │
        │  nginx ──► Node.js   │
        │           (port 5000)│
        └──────────┬───────────┘
                   │ Private network (TLS)
                   ▼
        ┌──────────────────────┐
        │  Managed Postgres    │   $15/mo · 1 GB / 10 GB
        │  (DigitalOcean)      │
        └──────────────────────┘

        Plus: weekly Droplet snapshots ($2.40/mo) cover uploaded files.
        Total: ~$29.40/mo.
```

---

## The 8 phases at a glance

| Phase | What you do | Where | Time |
|-------|-------------|-------|------|
| 1 | Sign up, claim Student Pack credit, install tools | Your laptop | 20 min |
| 2 | Create the Postgres database and the Droplet | DigitalOcean console | 15 min |
| 3 | Initial Linux setup (Node, nginx, security) | SSH into Droplet | 25 min |
| 4 | Get the code, write `.env`, test DB connection | SSH into Droplet | 25 min |
| 5 | Install dependencies, build, first foreground boot | SSH into Droplet | 20 min |
| 6 | Run as a systemd service + nginx reverse proxy + HTTPS | SSH into Droplet | 30 min |
| 7 | Feature verification checklist | Browser + SSH | 30 min |
| 8 | Backups + final hardening | DigitalOcean console + SSH | 20 min |

**Total: ~2.5–3 hours**, comfortably splittable across two evenings.

---

## Things you'll need before starting

- A laptop with internet (Windows, macOS, or Linux — these instructions assume Windows since that's what you use).
- A GitHub account with the Student Pack already approved ([apply here](https://education.github.com/pack) if you haven't).
- A credit/debit card for the DigitalOcean signup (they don't charge it while you have credit, but they require it on file).
- **Optional but strongly recommended**: a domain name. The Student Pack includes a free `.me` domain from Namecheap, or use any domain you already own. Without a domain, you can still deploy, but you'll have to accept browser warnings (no HTTPS certificate).

---

## Phase 1 — Pre-flight on your laptop (20 min)

### 1.1 Claim the Student Pack DigitalOcean credit

1. Open [https://education.github.com/pack](https://education.github.com/pack) and log in with your GitHub account.
2. Search for "DigitalOcean" and click **Get access**. This takes you to a DigitalOcean signup page.
3. **Important**: create a **new** DigitalOcean account through this link. If you already have a DO account that's used any promo credit before, the $200 won't apply.
4. Verify your email, add a payment method (don't worry — you only get charged when the $200 runs out).
5. After signup, check **Account → Billing**. You should see "Promotional credit: $200.00" with an expiration ~12 months out.

### 1.2 Generate an SSH key (the secure way to log in to your Droplet)

SSH keys are pairs of files: a **public** half you give to servers, and a **private** half you keep on your laptop. They replace passwords and are much more secure.

Open **PowerShell** on your laptop and run:

```powershell
ssh-keygen -t ed25519 -C "your-email@example.com"
```

When prompted:
- **File location**: just press Enter (accepts the default `C:\Users\YourName\.ssh\id_ed25519`).
- **Passphrase**: press Enter twice to skip (or set one — your call; you'll be prompted for it every time you SSH).

You now have two files:
- `C:\Users\YourName\.ssh\id_ed25519` — **private**, never share, never commit.
- `C:\Users\YourName\.ssh\id_ed25519.pub` — **public**, this is what you give to DigitalOcean.

Display the public key (you'll paste this into DigitalOcean in Phase 2):

```powershell
type $env:USERPROFILE\.ssh\id_ed25519.pub
```

Output looks like `ssh-ed25519 AAAAC3Nz... your-email@example.com`. Copy the whole line.

### 1.3 Confirm SSH works on your machine

Windows 10/11 has SSH built in. Verify:

```powershell
ssh -V
```

You should see `OpenSSH_for_Windows_X.X` or similar. If you get "ssh is not recognized", install the OpenSSH Client via **Settings → Apps → Optional Features → Add a feature → OpenSSH Client**.

### 1.4 (Optional) Pick and configure a domain name

Skip this if you don't want a domain — Phase 6 will tell you how to deploy without one.

- If you don't have one: claim the free Namecheap `.me` domain via the Student Pack (look for "Namecheap" in the pack).
- If you have one: log into your DNS provider's control panel. You'll create an A record in Phase 2 once you have the Droplet IP.

**Check Phase 1 is done:**
- [ ] $200 promotional credit visible in DigitalOcean billing.
- [ ] SSH key pair generated; you've copied the `.pub` contents.
- [ ] `ssh -V` works in PowerShell.

When all three are checked, move to Phase 2.

---

## Phase 2 — Provision infrastructure on DigitalOcean (15 min)

### 2.1 Create the Managed Postgres database

Postgres takes ~5 minutes to provision, so we start it first and let it cook while we do other things.

1. DigitalOcean console → left sidebar → **Databases** → **Create Database Cluster**.
2. **Engine**: PostgreSQL.
3. **Version**: the latest (16 or 17).
4. **Datacenter region**: pick one geographically close to your users. For Nepal/India, **BLR1 (Bangalore)** or **SGP1 (Singapore)** is best.
5. **Plan**: **Basic** → **Shared CPU** → smallest tier (1 GB RAM / 1 vCPU / 10 GB / **$15/mo**).
6. **Cluster name**: `vth-postgres`.
7. **Project**: default is fine.
8. Click **Create Database Cluster**. You'll see a status spinner — leave it and move on.

### 2.2 Create the Droplet

1. DigitalOcean console → **Droplets** → **Create Droplet**.
2. **Region**: ⚠️ **the same region as your Postgres database**. Cross-region traffic is slow and not free.
3. **Image**: **Ubuntu 24.04 (LTS) x64**.
4. **Size**:
   - Category: **Basic**
   - CPU options: **Regular (Intel with SSD)**
   - Plan: **2 GB / 1 CPU · 50 GB SSD · $12/mo**.
5. **Authentication method**: **SSH Key** → **New SSH Key**.
   - Paste the public key (the `ssh-ed25519 AAA...` line you copied in Phase 1.2).
   - Name it: `My Laptop`.
   - Save.
6. **Hostname**: `vth-app`.
7. **Project**: same one as the database.
8. **Enable backups**: ✅ check this box (~$2.40/mo for a 50 GB Droplet). This is what protects your uploaded files.
9. Click **Create Droplet**. Provisioning takes ~1 minute.

Once it's ready, copy the **public IPv4 address** from the Droplet list. Looks like `139.59.xx.xx`. Save it somewhere — you'll use it in Phase 3.

### 2.3 Wait for Postgres to finish provisioning

Go back to **Databases** → `vth-postgres`. When status is **Online** (green), click into it.

### 2.4 Restrict the database to the Droplet only

By default, the database accepts connections from anywhere. We tighten that.

1. In the `vth-postgres` cluster page → **Settings** tab → **Trusted Sources** section → **Edit**.
2. Type `vth-app` in the box — DO will offer the Droplet as a suggestion. Click it.
3. **Save**.

Now only your Droplet can reach the database. Even your laptop is blocked.

### 2.5 Get the database connection string

1. In `vth-postgres` → **Overview** tab → **Connection Details** panel (right side).
2. Connection parameters section, dropdown set to **Connection string**.
3. **Show the password**, then copy the entire string. It looks like:
   ```
   postgresql://doadmin:YOUR_PASSWORD_HERE@vth-postgres-do-user-12345-0.b.db.ondigitalocean.com:25060/defaultdb?sslmode=require
   ```
4. Save it somewhere safe — you'll paste this into the Droplet's `.env` file in Phase 4.

### 2.6 (Optional) Create a separate database for the app

The connection string above points to a database called `defaultdb`. That works, but it's cleaner to create one specifically for our app.

1. In `vth-postgres` → **Users & Databases** tab → **Databases** section → **+ New Database**.
2. Name: `vth_app`. Save.
3. Edit the connection string: change `/defaultdb?sslmode=require` to `/vth_app?sslmode=require`. Save the updated string.

### 2.7 (Optional) Point your domain at the Droplet

If you have a domain:
1. In your DNS provider's control panel, add an **A record**:
   - Host: `vth` (gives you `vth.yourdomain.com`) or `@` (uses the root domain).
   - Value: the Droplet's IPv4 from step 2.2.
   - TTL: default (usually 1 hour).
2. Wait 5–60 minutes for DNS to propagate. Verify from PowerShell:
   ```powershell
   nslookup vth.yourdomain.com
   ```
   The response should show the Droplet IP.

**Check Phase 2 is done:**
- [ ] Postgres cluster is Online, Trusted Sources = Droplet only.
- [ ] Connection string saved (with `/vth_app` if you created the separate DB).
- [ ] Droplet is running, IPv4 noted, weekly backups enabled.
- [ ] (Optional) DNS A record created and verified.

---

## Phase 3 — Initial Linux setup on the Droplet (25 min)

### 3.1 SSH in for the first time

From PowerShell on your laptop, replacing `139.59.xx.xx` with your actual Droplet IP:

```powershell
ssh root@139.59.xx.xx
```

First time, you'll get:
```
The authenticity of host '139.59.xx.xx' can't be established.
ED25519 key fingerprint is SHA256:...
Are you sure you want to continue connecting (yes/no)?
```
Type `yes` and press Enter.

If you set a passphrase on your SSH key in Phase 1.2, enter it now.

You should see a Ubuntu welcome banner and a prompt that looks like `root@vth-app:~#`.

> **Everything from here through Phase 6.4 happens on the Droplet** — i.e. inside this SSH session. If you disconnect, just `ssh root@139.59.xx.xx` again to get back in.

### 3.2 Update the system

```bash
apt update && apt upgrade -y
```

This takes 2-3 minutes. If you're asked about replacing config files, accept the defaults (press Enter or pick "keep the local version currently installed").

If you're asked to restart services, press Tab to highlight **\<Ok\>** and Enter — that's fine.

### 3.3 Install base tooling

```bash
apt install -y curl ca-certificates gnupg git ufw build-essential python3 postgresql-client
```

- `curl`, `ca-certificates`, `gnupg` — for downloading Node.js
- `git` — to clone the code
- `ufw` — simple firewall
- `build-essential`, `python3` — needed to compile `better-sqlite3` (yes, it's installed even though we're using Postgres)
- `postgresql-client` — gives you `psql` to test the database connection

### 3.4 Configure the firewall

We only allow SSH, HTTP, and HTTPS from the internet:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

You should see:
```
Status: active
22/tcp (OpenSSH)           ALLOW       Anywhere
80/tcp                     ALLOW       Anywhere
443/tcp                     ALLOW       Anywhere
```

### 3.5 Install Node.js 22 (LTS)

The app requires Node 22.x.

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
node --version
npm --version
```

Expected output: `v22.x.x` (any 22.x is fine), and `npm` version 10 or higher.

### 3.6 Create a dedicated service user

Running the app as root would be unsafe. We create a locked-down user that owns the app:

```bash
useradd --system --create-home --shell /usr/sbin/nologin vth-app
```

> The `--shell /usr/sbin/nologin` part means nobody can SSH in as this user. It can only run the app.

### 3.7 Create the directory layout

```bash
install -d -o vth-app -g vth-app /opt/vth-app           # app code
install -d -o vth-app -g vth-app /var/lib/vth-app       # data root
install -d -o vth-app -g vth-app /var/lib/vth-app/uploads  # case attachments
install -d -o vth-app -g vth-app /var/lib/vth-app/backups  # site backup zips
install -d -o vth-app -g vth-app /var/lib/vth-app/profile-photos  # user profile photos
install -d -o vth-app -g vth-app /var/lib/vth-app/password-reset-id-cards  # temp ID cards (forgot password)
install -d -o vth-app -g vth-app /var/log/vth-app       # log overflow
```

Why split `/opt` from `/var/lib`?
- `/opt/vth-app` — code, replaced on every deploy. Don't put data here.
- `/var/lib/vth-app` — data (uploads, backups). Persists across deploys. **This is what you must back up.**

**Check Phase 3 is done:**
- [ ] SSH in worked, you're at `root@vth-app:~#`.
- [ ] `node --version` shows v22.x.x.
- [ ] `ufw status` shows SSH/80/443 ALLOW, status active.
- [ ] `id vth-app` returns user info (proves the user was created).

---

## Phase 4 — Get the code and configure (25 min)

### 4.1 Clone the repository

```bash
sudo -u vth-app git clone https://github.com/DeepKShrestha/deep.VTH.app.git /opt/vth-app
cd /opt/vth-app
sudo -u vth-app git checkout main
```

Verify:

```bash
ls /opt/vth-app
```

You should see `package.json`, `server/`, `client/`, `docs/`, etc.

> If your repo is **private**, you'll need to set up a deploy key first. Tell me and I'll walk you through it — the public repo path is what these steps assume.

### 4.2 Test the Postgres connection from the Droplet

Replace `YOUR_CONNECTION_STRING` with the one from Phase 2.5:

```bash
psql "YOUR_CONNECTION_STRING" -c "SELECT version();"
```

You should see something like:
```
                                                       version
─────────────────────────────────────────────────────────────────────────────────────────────────────
 PostgreSQL 16.x on x86_64-pc-linux-gnu, compiled by gcc...
```

If you get a connection error, check:
- The Trusted Sources includes this Droplet (Phase 2.4).
- You copied the password correctly (it has special characters — be careful when pasting).
- You're in the same region (cross-region adds latency but should still work).

### 4.3 Generate a signing secret

The app uses a secret to sign attachment URLs. Generate a random 64-character hex string:

```bash
openssl rand -hex 32
```

Copy the output (a long hex string). Save it temporarily.

### 4.4 Create the `.env` file

```bash
sudo -u vth-app cp /opt/vth-app/.env.example /opt/vth-app/.env
chmod 600 /opt/vth-app/.env
chown vth-app:vth-app /opt/vth-app/.env
nano /opt/vth-app/.env
```

A text editor opens. **Replace the entire contents** with this (substituting your real values):

```ini
NODE_ENV=production
PORT=5000

# Signing secret from step 4.3 (64-char hex string)
ATTACHMENT_SIGNING_SECRET=PASTE_OUTPUT_OF_openssl_rand_hex_32_HERE

# DigitalOcean Managed Postgres
DB_PROVIDER=postgres
# Use sslmode=no-verify in the URL (pg driver). Encryption stays on; DO's CA chain is not validated by default.
DATABASE_URL=postgresql://doadmin:YOUR_PASSWORD@vth-postgres-do-user-XXXXX-0.b.db.ondigitalocean.com:25060/vth_app?sslmode=no-verify

# Storage paths (absolute, under /var/lib — systemd only allows writes there)
CASE_ATTACHMENTS_DIR=/var/lib/vth-app/uploads
BACKUP_LOCAL_DIR=/var/lib/vth-app/backups
PROFILE_PHOTO_DIR=/var/lib/vth-app/profile-photos
PASSWORD_RESET_ID_CARD_DIR=/var/lib/vth-app/password-reset-id-cards

# First-time admin bootstrap.
# After first login, change this to false (or delete the admin user via the UI).
ALLOW_DEFAULT_ADMIN=true
DEFAULT_ADMIN_PASSWORD=PickAStrongPasswordWithLettersAndDigits_123

# Hidden break-glass account — leave OFF unless you have a specific reason to enable.
HIDDEN_SUPERADMIN_ENABLED=false

# Default behaviour: wipe all sessions on every server restart (safer).
# Uncomment the next line ONLY if you want active sessions to survive restarts.
# WIPE_SESSIONS_ON_BOOT=false

LOG_RESPONSE_BODIES=false
```

Save and exit nano: `Ctrl+O`, Enter, `Ctrl+X`.

**Important security notes:**
- `DEFAULT_ADMIN_PASSWORD` must be **12+ characters with both letters and digits**, or the server refuses to start.
- Don't commit this file anywhere — it has secrets.

### 4.5 Test the Postgres connection through the app's helper script

Before doing the full build, sanity-check that the app can talk to the DB:

```bash
cd /opt/vth-app
sudo -u vth-app -E env DATABASE_URL="$(grep ^DATABASE_URL .env | cut -d= -f2-)" npx tsx script/check-postgres.ts
```

Expected output: `Postgres connection OK`.

If you see this, your environment is wired correctly.

**Check Phase 4 is done:**
- [ ] `ls /opt/vth-app` shows the project files.
- [ ] `psql ... SELECT version()` returned a Postgres version string.
- [ ] `.env` file exists with chmod 600.
- [ ] `npx tsx script/check-postgres.ts` printed "Postgres connection OK".

---

## Phase 5 — Build the application (20 min)

### 5.1 Install dependencies

```bash
cd /opt/vth-app
sudo -u vth-app npm ci
```

This takes 3-5 minutes and downloads ~500 MB of npm packages. Don't worry about npm warnings — only "error" lines matter.

### 5.2 Run the full verify (typecheck + tests + build)

```bash
sudo -u vth-app npm run verify
```

This runs three steps:
1. **Tests** (`vitest run`) — ~30 seconds.
2. **Type-check** (`tsc`) — ~1 minute.
3. **Build** (`tsx script/build.ts`) — ~2 minutes, produces `dist/index.cjs` and `client/dist/`.

Total: ~5 minutes on a 2 GB Droplet.

Expected at the end:
```
✓ Build complete.
```

If a test fails or build errors out, **stop and read the error**. It's almost always one of:
- `ATTACHMENT_SIGNING_SECRET must be set` → your `.env` is missing it.
- `ECONNREFUSED 127.0.0.1:5432` → wrong `DATABASE_URL`.
- `out of memory` (rare on 2 GB) → re-run the command; if it persists, see "Troubleshooting" at the bottom.

### 5.3 First foreground boot (smoke test)

We run the app once in the foreground to confirm it starts, then we'll wire it as a service.

```bash
cd /opt/vth-app
sudo -u vth-app -E env $(grep -v '^#' .env | xargs -d '\n') node dist/index.cjs
```

Watch the logs. You're looking for:

```
[migrations] Running 4 pending Postgres migrations...
[migrations] Applied 4 migrations.
[BOOTSTRAP] Created superadmin username="admin" with one-time password: ...   <-- or no bootstrap line if you set DEFAULT_ADMIN_PASSWORD
[sessions] Wiping all sessions on boot — every user must log in again. ...
serving on port 5000
```

If you see `serving on port 5000`, **you're up**.

### 5.4 Hit the health endpoints

Open a **second PowerShell window** on your laptop. SSH into the Droplet again:

```powershell
ssh root@139.59.xx.xx
```

Now from inside that second SSH session, hit the local endpoints:

```bash
curl http://127.0.0.1:5000/api/health
# {"status":"ok"}

curl http://127.0.0.1:5000/api/ready
# {"status":"ready","db":"ok"}
```

If both return OK, the app process is healthy and the DB is reachable.

### 5.5 Stop the foreground process

Back in your **first** SSH window (where the app is running), press `Ctrl+C` to stop it. You should be back at the `root@vth-app:/opt/vth-app#` prompt.

**Check Phase 5 is done:**
- [ ] `npm ci` finished without errors.
- [ ] `npm run verify` ended with "Build complete".
- [ ] Foreground run logged "serving on port 5000".
- [ ] `/api/health` returned `{"status":"ok"}`.
- [ ] `/api/ready` returned `{"status":"ready","db":"ok"}`.

---

## Phase 6 — Production wiring (30 min)

### 6.1 Create the systemd service

Systemd is Linux's process manager. It will start the app on boot, restart it if it crashes, and let us tail logs cleanly.

```bash
nano /etc/systemd/system/vth-app.service
```

Paste exactly this:

```ini
[Unit]
Description=VTH-app (Veterinary Teaching Hospital case manager)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=vth-app
Group=vth-app
WorkingDirectory=/opt/vth-app
EnvironmentFile=/opt/vth-app/.env
ExecStart=/usr/bin/node /opt/vth-app/dist/index.cjs

# Security hardening
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
# Do NOT set MemoryDenyWriteExecute=true — Node.js needs executable memory and will exit immediately.

# Resource ceilings (tune to your VM)
LimitNOFILE=4096
TasksMax=200

Restart=on-failure
RestartSec=5s

[Install]
WantedBy=multi-user.target
```

Save: `Ctrl+O`, Enter, `Ctrl+X`.

Enable and start it:

```bash
systemctl daemon-reload
systemctl enable --now vth-app
systemctl status vth-app
```

Expected: a green "active (running)" line. Press `q` to exit the status view.

Tail the logs to make sure it's healthy:

```bash
journalctl -u vth-app -f
```

You should see the same startup logs as Phase 5.3. Press `Ctrl+C` to stop tailing (this doesn't stop the service, just the log view).

Re-test the endpoints:

```bash
curl http://127.0.0.1:5000/api/health
curl http://127.0.0.1:5000/api/ready
```

Both should return OK.

### 6.2 Install nginx (the reverse proxy)

Nginx accepts traffic from the internet on ports 80 and 443, and forwards it to our Node app on port 5000.

```bash
apt install -y nginx
systemctl enable --now nginx
```

Verify by visiting `http://YOUR_DROPLET_IP` in your laptop's browser. You should see the default "Welcome to nginx!" page.

### 6.3 Configure nginx for our app

Decide on a server name now:
- **If you have a domain**: use `vth.yourdomain.com` (or whatever you set up in Phase 2.7).
- **If you don't**: use `_` (underscore) as a wildcard that matches anything.

```bash
nano /etc/nginx/sites-available/vth-app.conf
```

Paste (replace `vth.yourdomain.com` with your domain, or `_` if no domain):

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name vth.yourdomain.com;

    # Max upload size — case attachments are auto-compressed to <1 MB but be generous.
    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Save and exit.

Enable the site, disable the default:

```bash
ln -sf /etc/nginx/sites-available/vth-app.conf /etc/nginx/sites-enabled/vth-app.conf
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
```

If `nginx -t` says "syntax is ok" + "test is successful", you're good.

Visit `http://YOUR_DROPLET_IP` (or `http://vth.yourdomain.com`) in your browser. You should now see the **VTH-app login screen**, not the nginx welcome page.

### 6.4 Add HTTPS with Let's Encrypt (only if you have a domain)

⚠️ Skip this section if you don't have a domain — you can't get a Let's Encrypt cert for a raw IP address. The app will still work over HTTP for testing.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d vth.yourdomain.com --redirect --agree-tos -m your-email@example.com --no-eff-email
```

Certbot will:
- Request a free TLS certificate from Let's Encrypt.
- Rewrite your nginx config to add `listen 443 ssl`.
- Add an HTTP → HTTPS redirect.
- Install a systemd timer that auto-renews the certificate every 90 days.

Verify:
```bash
curl -I https://vth.yourdomain.com/api/health
# HTTP/2 200
```

Visit `https://vth.yourdomain.com` in your browser — you should see the login page with a padlock in the address bar.

**Check Phase 6 is done:**
- [ ] `systemctl status vth-app` shows "active (running)".
- [ ] `journalctl -u vth-app -f` shows healthy boot logs.
- [ ] `http://YOUR_DOMAIN_OR_IP/` loads the VTH login page.
- [ ] (If domain) `https://YOUR_DOMAIN/` loads with a padlock.

---

## Phase 7 — Feature verification checklist (30 min)

Now we confirm every major feature works on the live server. Work through these in order.

For each test, **note any errors** so we can fix them before users touch the system.

### 7.1 Authentication & accounts

| # | Test | How | Expected |
|---|------|-----|----------|
| 1 | Log in as bootstrap admin | Visit `/`, enter `admin` + your `DEFAULT_ADMIN_PASSWORD` | Dashboard loads |
| 2 | Create a real admin user | Admin Panel → Users → Add user. Role: admin. | User appears in list |
| 3 | Log out, log in as new admin | | Dashboard loads |
| 4 | Enable 2FA on your new admin | Profile → Security → Enable 2FA | QR code shows; pair with Google Authenticator; verify code accepted |
| 5 | Log out, log in with 2FA | | Login asks for TOTP code; works |
| 6 | Self-service password change | Profile → Change password | Works without admin approval |
| 7 | Forgot password flow | Log out → Forgot password | Submits a request that admins can approve |

### 7.2 Hospital case workflow

| # | Test | Expected |
|---|------|----------|
| 8 | Register a hospital case | New Case → Hospital → fill required fields → Save | Case saved, case number generated |
| 9 | Upload an attachment (>1 MB image) | In the case editor, add an attachment | Image is auto-compressed to <1 MB, uploaded, thumbnail shows |
| 10 | Add medications in Treatment | Add 2-3 meds with route, dose | Saved, visible on case view |
| 11 | View the case | Click the case from Previous Cases | All fields render, attachments visible |
| 12 | Edit the case | Edit → change a field → Save | Change persists |
| 13 | Owner repeat-visit detection | Register a 2nd case with the same phone number | Owner-history panel shows the previous case |

### 7.3 AST case workflow

| # | Test | Expected |
|---|------|----------|
| 14 | Register an AST case | New Case → AST → fill required fields → Save | Case saved |
| 15 | AST results — enter zones | In the case, enter inhibition zone diameters for several antibiotics | Sensitivity (S/I/R) auto-classified |

### 7.4 Search, filter, export

| # | Test | Expected |
|---|------|----------|
| 16 | Search Previous Cases | Type in the search box | Results filter live |
| 17 | Date filter | Date button → pick "Last 7 days" | List narrows |
| 18 | Date filter — custom BS range | Date button → Custom → pick BS dates | Works |
| 19 | CSV export | Cases list → Export → CSV | File downloads; opens in Excel; no `=`/`+`/`@` formula injection |
| 20 | XLSX export | Export → XLSX | File downloads |

### 7.5 Hospital dashboard (the analyst dashboard)

| # | Test | Expected |
|---|------|----------|
| 21 | Open hospital dashboard | New Case → Hospital → Dashboard icon | Loads with narrative + KPIs |
| 22 | Period selector | Click "Last 7 days", "Last 30 days", "QTD" | Numbers and charts update |
| 23 | Compare to prior toggle | Toggle on/off | Delta badges appear/disappear |
| 24 | Filter by department | Filters → Department → pick one | Dashboard re-filters |
| 25 | URL state | Copy the dashboard URL after applying filters → paste in a new tab | Filters are restored |
| 26 | Pareto chart | Scroll to "Top medications — Pareto" | Bars + cumulative % line + 80% reference visible |
| 27 | Medications drill-down table | "Prescribed medications — full ranking" accordion | Sortable; class chips clickable; CSV export works |
| 28 | Drill-down CSV export | Click Export CSV on cases table | File downloads with all visible rows |

### 7.6 Form editor

| # | Test | Expected |
|---|------|----------|
| 29 | Add a custom question | Admin → Form Editor → Add Question | Saved; appears in case form |
| 30 | Add a dropdown with options | Question type: Dropdown; add options | Options render in case form |

### 7.7 Site backups (superadmin only)

| # | Test | Expected |
|---|------|----------|
| 31 | Create a site backup | Admin → Backups → Create | ZIP file appears in the list |
| 32 | Download the backup | Click Download | File downloads to your laptop |

**If backup fails with `server version mismatch` (pg_dump 16.14 vs server 16.4):**

Ubuntu’s `postgresql-client` is often **newer** than DigitalOcean Managed Postgres. Newer `pg_dump` refuses to dump an older server.

**Recommended fix:** DigitalOcean console → **Databases** → your cluster → **Settings** → upgrade Postgres to the **latest 16.x** patch (e.g. 16.14). Then retry **Run backup now**.

**Alternative:** On the Droplet, confirm versions:

```bash
pg_dump --version
# compare to server (from DO database overview, e.g. 16.4)
```

If they still differ, set `PG_BIN` in `/opt/vth-app/.env` to a `pg_dump` that matches the server major/minor, then `systemctl restart vth-app`.

**Automatic backup settings:** Enable the toggle, set interval and “Keep last N” separately — each saves independently. Default retention is **7** zips; oldest local zips are deleted after each **successful** backup.

### 7.8 Server-side smoke tests

Back in SSH on the Droplet:

```bash
# Service is healthy
systemctl status vth-app
# active (running)

# No errors in the last hour
journalctl -u vth-app --since "1 hour ago" -p err
# (should print nothing or only benign messages)

# Disk usage is reasonable
df -h /var/lib/vth-app
# Used: <5% on a fresh deploy

# Memory headroom on the Droplet
free -h
# Available should be >800 MB

# Sessions wipe on restart (the change you asked for)
systemctl restart vth-app
# Reload the app in your browser → you'll be redirected to login
```

**Check Phase 7 is done:**
- [ ] All 7.1–7.7 tests pass (or any failures are noted with details).
- [ ] Service is "active (running)".
- [ ] No errors in journalctl from the last hour.
- [ ] Restart logs everyone out (confirms the wipe-sessions-on-boot default).

If a test fails, paste the error to me and we'll debug it.

---

## Phase 8 — Final hardening + backups (20 min)

### 8.1 Disable the default admin bootstrap

Now that you have a real admin (Test 2 in Phase 7), close the bootstrap door.

```bash
nano /opt/vth-app/.env
```

Change:
```ini
ALLOW_DEFAULT_ADMIN=true
```
to:
```ini
ALLOW_DEFAULT_ADMIN=false
```

You can also remove the `DEFAULT_ADMIN_PASSWORD=` line — it's no longer needed.

Save and restart:
```bash
systemctl restart vth-app
```

Optionally delete the `admin` user via the Admin → Users UI now that you have your own admin.

### 8.2 Verify DigitalOcean backups are enabled

- **Droplet**: DO console → Droplets → vth-app → Backups tab → should show "Enabled" with a weekly schedule.
- **Postgres**: DO console → Databases → vth-postgres → Backups tab → should show automatic daily backups with 7-day retention.

Both are included in the prices we picked. No further action needed.

### 8.3 Take an immediate manual backup

Don't wait for the weekly cycle for your first backup.

- DO console → Droplets → vth-app → Snapshots → **Take Snapshot** → name it `pre-pilot-launch-YYYY-MM-DD`.
- DO console → Databases → vth-postgres → Backups → first scheduled backup will appear within 24 hours; you can't force one on the dev tier but the snapshot above captures the app code and uploads.

### 8.4 Set up a billing alert

Don't let the credit silently run out.

- DO console → Account → Billing → **Billing alerts** → add alerts at **$50, $100, and $150** of usage. You'll get emails so you know roughly when the credit is half/three-quarters spent.

### 8.5 Document the access details somewhere safe

Save this in a password manager (1Password, Bitwarden, etc.):

- DigitalOcean account email + password.
- DigitalOcean 2FA recovery codes.
- Droplet IPv4.
- The path to your SSH private key on your laptop.
- The Postgres connection string.
- The bootstrap admin password (if you keep it as a break-glass).
- The `ATTACHMENT_SIGNING_SECRET` (you'd regenerate it if you lose it, but then all currently-signed URLs invalidate immediately).

**Check Phase 8 is done:**
- [ ] `ALLOW_DEFAULT_ADMIN=false` in `.env`, service restarted.
- [ ] Droplet weekly backups enabled in DO console.
- [ ] Postgres automatic backups visible in DO console.
- [ ] Initial snapshot taken.
- [ ] Billing alerts configured.
- [ ] Access details saved in a password manager.

---

## You're live

The pilot deployment is complete. Share `https://vth.yourdomain.com` (or `http://YOUR_DROPLET_IP`) with your users.

---

## Day-2 operations cheat sheet

All commands are run as `root` on the Droplet via SSH.

### Tail live logs
```bash
journalctl -u vth-app -f
```

### Restart the app
```bash
systemctl restart vth-app
```
> Reminder: this logs everyone out. Tell users before you do it during work hours.

### See recent errors only
```bash
journalctl -u vth-app -p err --since "24 hours ago"
```

### Disk usage
```bash
df -h /var/lib/vth-app
du -sh /var/lib/vth-app/*
```

### Memory
```bash
free -h
```

### Restore from a Droplet snapshot
- DO console → Snapshots → pick one → "Restore Droplet" (creates a new Droplet from the snapshot; you can then destroy the old one and point DNS at the new one).

### Deploy a new version
```bash
cd /opt/vth-app
sudo -u vth-app git fetch
sudo -u vth-app git checkout main
sudo -u vth-app git pull
sudo -u vth-app npm ci
sudo -u vth-app npm run verify
systemctl restart vth-app
journalctl -u vth-app -f          # watch for migration output and "serving on port 5000"
```

---

## Troubleshooting

### `npm run verify` was killed mid-build

Out of memory. Add 2 GB swap and retry:
```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.d/99-swap.conf
sudo -u vth-app npm run verify
```

### `systemctl status vth-app` shows `(code=exited, status=1/FAILURE)`

```bash
journalctl -u vth-app -n 100 --no-pager
```
Common causes:

| Error | Cause | Fix |
|-------|-------|-----|
| `ATTACHMENT_SIGNING_SECRET must be set ...` | `.env` missing or unreadable | Check `chmod 600 /opt/vth-app/.env` and that the line is set. |
| `DATABASE_URL is required when DB_PROVIDER=postgres` | Wrong env var | Confirm `.env` has `DB_PROVIDER=postgres` AND `DATABASE_URL=...`. |
| `connect ECONNREFUSED ...:5432` (or `:25060`) | DB unreachable | Trusted Sources, password, region, or Droplet IP changed. |
| `HIDDEN_SUPERADMIN_ENABLED=true requires HIDDEN_SUPERADMIN_PASSWORD ...` | Enabled without strong password | Either set the password or set `HIDDEN_SUPERADMIN_ENABLED=false`. |
| `EADDRINUSE: ... 0.0.0.0:5000` | Another process holds the port | `ss -tlnp \| grep 5000` and kill the duplicate. |

### Browser shows 502 Bad Gateway from nginx

The Node process isn't responding on 127.0.0.1:5000.
```bash
systemctl status vth-app
ss -tlnp | grep 5000
```
If service isn't running, start it; if it's on a different port, fix `PORT` in `.env`.

### Login works but every other request returns 401

The default behaviour is to wipe all sessions on every restart. If you don't want this, set `WIPE_SESSIONS_ON_BOOT=false` in `.env` and restart. Otherwise this is expected — just log back in.

### Login returns 200 then immediately logs you out (`text > timestamp with time zone`)

Postgres `sessions` columns were TEXT but queries compared them to `NOW()`. Migration `0018_sessions_timestamptz.sql` fixes new deploys. On an existing DB, run (use `sslmode=require` in the URL for `psql`, not `no-verify`):

```bash
export $(grep -E '^[A-Z_]+=' /opt/vth-app/.env | xargs -d '\n')
PSQL_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
PGSSLMODE=require psql "$PSQL_URL" -c "ALTER TABLE sessions ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::timestamptz;"
PGSSLMODE=require psql "$PSQL_URL" -c "ALTER TABLE sessions ALTER COLUMN expires_at TYPE TIMESTAMPTZ USING expires_at::timestamptz;"
PGSSLMODE=require psql "$PSQL_URL" -c "ALTER TABLE sessions ALTER COLUMN last_seen_at TYPE TIMESTAMPTZ USING last_seen_at::timestamptz;"
systemctl restart vth-app
```

### Profile photo upload: `ENOENT ... mkdir '/opt/vth-app/uploads/profile-photos'`

Set `PROFILE_PHOTO_DIR=/var/lib/vth-app/profile-photos` in `.env`, create the directory, restart (see Phase 3.7).

### Images / attachments fail to load

Signed URLs expire after 30 minutes (`ATTACHMENT_SIGNING_TTL_MS` default). Refresh the page. If it still fails:
- Check `ls -ld /var/lib/vth-app/uploads` — should be owned by `vth-app:vth-app`.
- Check `journalctl -u vth-app | grep attachment` for signing errors.

### Need to reset a forgotten admin password without UI access

If you have another admin: use the Forgot Password flow and approve it from the other admin's account.

If you have **no working admin**, last-resort manual reset via psql:
```bash
psql "$(grep ^DATABASE_URL /opt/vth-app/.env | cut -d= -f2-)"
# inside psql:
# 1. Generate a bcrypt hash for the new password OFFLINE first:
#    node -e "console.log(require('bcryptjs').hashSync('NewPassword_123', 10))"
# 2. Then run:
UPDATE users SET password_hash='PASTE_HASH_HERE', failed_login_attempts=0, locked_until=NULL WHERE username='admin';
\q
systemctl restart vth-app
```

---

## Cost reference

| Resource | Monthly | Notes |
|----------|---------|-------|
| Droplet 2 GB / 50 GB | $12.00 | The VM the app runs on |
| Droplet weekly backups | $2.40 | 20% of Droplet cost |
| Managed Postgres dev tier | $15.00 | Includes daily backups, 7-day retention |
| **Total** | **$29.40** | **~6.8 months runway on $200 Student Pack credit** |

To check actual usage: DO console → Account → Billing → "Current usage".

---

**Related docs:** [`SERVER-DEPLOYMENT-GUIDE.md`](./SERVER-DEPLOYMENT-GUIDE.md) (shorter, no Linux hand-holding) · [`PRODUCTION-DEPLOYMENT.md`](./PRODUCTION-DEPLOYMENT.md) (checklist version) · [`OPERATIONS.md`](./OPERATIONS.md) (day-2 ops) · [`README.md`](../README.md) (architecture overview).
