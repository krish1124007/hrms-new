# HRMS — Hostinger VPS Deployment Guide

This guide takes a fresh Hostinger VPS (Ubuntu 22.04 / 24.04) and brings the
full HRMS stack online with Docker. Total time: **~20 minutes** plus image-build
time (~5 to 10 minutes the first time, then cached).

The stack you'll deploy:

| Container       | What it is                       | Public? |
| --------------- | -------------------------------- | ------- |
| `hrms-web`      | Nginx → React SPA + API/WS proxy | ✅ 80/443 |
| `hrms-api`      | Express.js + Socket.io + worker  | ❌ internal |
| `hrms-mongo`    | MongoDB 8 (auth on)              | ❌ internal |
| `hrms-redis`    | Redis 7 (password)               | ❌ internal |
| `hrms-meili`    | Meilisearch                      | ❌ internal |

The mobile app, e2e tests, and load tests have all been removed from this
package — only the web dashboard + API are deployed.

---

## 0. Prerequisites

| What                | Where to get it                                  |
| ------------------- | ------------------------------------------------ |
| Hostinger VPS       | hPanel → VPS → KVM 2 or higher (≥ 2 vCPU, 4 GB RAM) |
| OS                  | Ubuntu 22.04 LTS (or 24.04)                      |
| SSH access          | hPanel → VPS → "SSH Access" — copy IP + root pwd |
| (Optional) Domain   | DNS A-record → your VPS IP                       |
| Local terminal      | macOS / Linux / Windows PowerShell or WSL        |

> Minimum recommended VPS: **2 vCPU / 4 GB RAM / 50 GB disk**. The full image
> build needs ~3 GB of free RAM. If you only have 2 GB, add swap (step 1.4).

---

## 1. Provision the VPS

### 1.1  SSH in
```bash
ssh root@YOUR_VPS_IP
```

### 1.2  Update the system
```bash
apt-get update && apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg ufw fail2ban unzip
```

### 1.3  Create a non-root user (recommended)
```bash
adduser hrms
usermod -aG sudo hrms
mkdir -p /home/hrms/.ssh
cp ~/.ssh/authorized_keys /home/hrms/.ssh/      # if you logged in by key
chown -R hrms:hrms /home/hrms/.ssh
chmod 700 /home/hrms/.ssh
chmod 600 /home/hrms/.ssh/authorized_keys 2>/dev/null || true
```
Log out and reconnect as `hrms` (or stay as root — the rest works either way).

### 1.4  (Only if VPS has < 4 GB RAM) — add a 4 GB swapfile
```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### 1.5  Firewall — open only what you need
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

### 1.6  Install Docker + Compose plugin
```bash
# Official Docker install (one-liner)
curl -fsSL https://get.docker.com | sudo sh

# Allow your user to run docker without sudo (re-login after this)
sudo usermod -aG docker $USER

# Verify
docker --version
docker compose version
```

If you see "docker: command not found" after the install, log out and back in.

---

## 2. Upload the project to the VPS

You have **three** options — pick whichever you find easier.

### Option A — upload the zip from your laptop (simplest)
On your **local machine**:
```bash
scp ~/Desktop/DDOPC-HRMS-Deploy.zip root@YOUR_VPS_IP:/opt/
```
Then on the **VPS**:
```bash
sudo mkdir -p /opt/hrms && cd /opt/hrms
sudo unzip /opt/DDOPC-HRMS-Deploy.zip -d /opt/hrms
sudo chown -R $USER:$USER /opt/hrms
```

### Option B — Hostinger File Manager (no SSH for upload)
hPanel → VPS → **Files** → upload `DDOPC-HRMS-Deploy.zip` to `/opt/`, then run
the unzip + chown commands above via the SSH terminal.

### Option C — git clone (if you push the project to GitHub)
```bash
sudo mkdir -p /opt/hrms && cd /opt/hrms
git clone https://github.com/YOU/your-repo.git .
```

After any option, you should see this layout:
```
/opt/hrms/
├── apps/
├── docker/
├── packages/
├── scripts/
├── .env.production
├── docker-compose.yml  (inside docker/)
└── DEPLOY.md           (this file)
```

---

## 3. Configure environment variables

```bash
cd /opt/hrms
cp .env.production .env
nano .env
```

**Generate strong secrets** — paste each output into the matching `.env` field:
```bash
openssl rand -hex 64        # JWT_SECRET
openssl rand -hex 64        # JWT_REFRESH_SECRET    (must differ from above)
openssl rand -hex 24        # ENCRYPTION_KEY
openssl rand -hex 24        # MONGO_ROOT_PASSWORD
openssl rand -hex 24        # REDIS_PASSWORD
openssl rand -hex 24        # MEILI_MASTER_KEY
```

**Fields you MUST set:**
- `MONGO_ROOT_USERNAME`, `MONGO_ROOT_PASSWORD` — DB credentials
- `REDIS_PASSWORD` — Redis password
- `MEILI_MASTER_KEY` — search-engine key
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`
- `CORS_ORIGIN` — set to `http://YOUR_VPS_IP` for first run (later: `https://yourdomain.com`)
- `COMPANY_NAME`, `COMPANY_EMAIL`

**Fields you SHOULD set** (optional but recommended):
- `SMTP_*` — without these, password-reset emails won't send

Save with `Ctrl+O`, `Enter`, `Ctrl+X`.

> ⚠️ **Never commit `.env` to git.** It contains all your secrets.

---

## 4. Build and start the stack

From `/opt/hrms`:

```bash
chmod +x scripts/*.sh
./scripts/deploy.sh up
```

This runs `docker compose build` then `docker compose up -d`.
First build downloads + compiles everything — expect **5 to 10 minutes**.

**Watch the logs:**
```bash
./scripts/deploy.sh logs        # Ctrl+C to exit (containers stay running)
```

You're looking for the line:
```
INFO  API listening on http://localhost:4000
INFO  Backup worker started
```

**Verify each container is healthy:**
```bash
./scripts/deploy.sh ps
```
All five rows should say `Up (healthy)`.

---

## 5. Load data — pick ONE of the two paths

### 5a. Migrate your existing data (this package already has it)

This zip ships with a snapshot of your local development database in
`data-export/`:

```
data-export/
├── MANIFEST.txt           ← when it was made + sizes
├── mongo.archive.gz       ← full Mongo dump (gzipped archive)
└── uploads/               ← payslips, documents, policies, backups
```

Restore it into the running stack:

```bash
./scripts/import-data.sh
```

The script will:
1. Run `mongorestore --drop` against the `mongodb` container — replaces every
   collection in the target DB with what's in the archive.
2. Copy `data-export/uploads/` into the `hrms_uploads` Docker volume so the
   API can serve existing payslips and attachments.
3. Restart the API so Meilisearch indexes get rebuilt.

It will prompt `Type YES to continue:` first — that's the safety guard.

After import you can log in with the **same email + password you used locally**.

> 💡 Updating data later? On your laptop, re-run `./scripts/export-local-data.sh`,
> rebuild the zip, upload, and run `./scripts/import-data.sh` again. It uses
> `--drop` so re-imports are idempotent.

### 5b. Or start fresh with a default admin

If you'd rather start from a clean DB, **delete `data-export/`** before
running `import-data.sh` (or just skip it) and seed instead:

```bash
./scripts/deploy.sh seed
```

This creates:
- **Email:** `admin@example.com`
- **Password:** `Admin@123`

> 🔐 **Change this password immediately** after first login.

---

## 6. Smoke-test the deployment

```bash
# API health (from the VPS)
curl -i http://localhost/api/health

# Web dashboard (from your laptop)
open http://YOUR_VPS_IP        # macOS
start http://YOUR_VPS_IP       # Windows
xdg-open http://YOUR_VPS_IP    # Linux
```

You should see the HRMS login page. Log in with the seed credentials.

---

## 7. Enable HTTPS (recommended, requires a domain)

### 7.1  Point a domain at the VPS
In your DNS provider (Hostinger DNS, Cloudflare, etc.):
- Create an **A record** for `app.yourdomain.com` → your VPS IP

Wait for DNS to propagate (1 minute to 1 hour). Verify:
```bash
dig +short app.yourdomain.com
# Should print your VPS IP
```

### 7.2  Get the certificate via Certbot (host-based, simplest)
```bash
sudo apt-get install -y certbot
# Stop nginx temporarily so certbot can use port 80
docker compose -f docker/docker-compose.yml stop web
sudo certbot certonly --standalone -d app.yourdomain.com \
  --agree-tos -m you@yourdomain.com --no-eff-email
docker compose -f docker/docker-compose.yml start web
```

Certs land in `/etc/letsencrypt/live/app.yourdomain.com/`.

### 7.3  Mount certs + enable HTTPS in nginx

Symlink the certs into the project's `docker/ssl/` directory:
```bash
sudo mkdir -p docker/ssl
sudo ln -s /etc/letsencrypt/live   docker/ssl/live
sudo ln -s /etc/letsencrypt/archive docker/ssl/archive
```

Edit `docker/nginx.conf`:
1. **Uncomment** the entire `# server { listen 443 ssl http2; … }` block at the bottom.
2. Replace `yourdomain.com` with `app.yourdomain.com`.
3. In the **HTTP** server block, replace the body with a redirect:
   ```nginx
   server {
       listen 80;
       server_name app.yourdomain.com;
       location /.well-known/acme-challenge/ { root /var/www/certbot; }
       location / { return 301 https://$host$request_uri; }
   }
   ```

Update `.env`:
```bash
CORS_ORIGIN=https://app.yourdomain.com
```

Rebuild + restart:
```bash
./scripts/deploy.sh up
```

### 7.4  Auto-renewal
Certbot installs a systemd timer that renews automatically. Test:
```bash
sudo certbot renew --dry-run
```
Add a post-renew hook so nginx picks up the new cert:
```bash
sudo bash -c 'cat > /etc/letsencrypt/renewal-hooks/deploy/reload-hrms.sh' <<'EOF'
#!/usr/bin/env bash
docker exec hrms-web nginx -s reload
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-hrms.sh
```

---

## 8. Set up automated daily backups

```bash
crontab -e
```
Add this line (runs every day at 2 a.m.):
```cron
0 2 * * * cd /opt/hrms && ./scripts/backup.sh >> /var/log/hrms-backup.log 2>&1
```

Backups land in `/opt/hrms/backups/` and are auto-pruned after 14 days.

**To restore from a backup:**
```bash
./scripts/restore.sh ./backups/hrms-hrms-YYYYMMDD-HHMMSS.archive.gz
```

> 💡 For off-site backups, also copy the tarballs to S3 / Backblaze /
> Hostinger Object Storage from cron.

---

## 9. Day-2 operations — the command list

All commands run from `/opt/hrms`.

| What                              | Command                                          |
| --------------------------------- | ------------------------------------------------ |
| Start the stack                   | `./scripts/deploy.sh up`                         |
| Stop the stack (keep data)        | `./scripts/deploy.sh stop`                       |
| Tail logs (all services)          | `./scripts/deploy.sh logs`                       |
| Tail one service's logs           | `docker logs -f hrms-api`                        |
| Container status / health         | `./scripts/deploy.sh ps`                         |
| Restart one service               | `docker compose -f docker/docker-compose.yml restart api` |
| Apply code changes (rebuild + redeploy) | `git pull && ./scripts/deploy.sh up`       |
| Seed / reset admin user           | `./scripts/deploy.sh seed`                       |
| Backup MongoDB now                | `./scripts/backup.sh`                            |
| Restore MongoDB from a backup     | `./scripts/restore.sh ./backups/<file>.archive.gz` |
| Open a Mongo shell                | `docker exec -it hrms-mongo mongosh -u $MONGO_ROOT_USERNAME -p $MONGO_ROOT_PASSWORD --authenticationDatabase admin` |
| Open a Redis shell                | `docker exec -it hrms-redis redis-cli -a "$REDIS_PASSWORD"` |
| Disk usage of containers          | `docker system df`                               |
| Reclaim unused space              | `docker system prune -af --volumes` (⚠️ careful) |
| **DESTROY** all data + containers | `./scripts/deploy.sh nuke`                       |

---

## 10. Updating the application

When you change the code:

```bash
cd /opt/hrms

# If using git:
git pull

# If uploading a new zip:
# (rsync the new files in, preserving .env and backups/)

./scripts/deploy.sh up        # rebuilds changed images and rolls them out
```

The `.env` file, `mongo_data`, `redis_data`, and `hrms_uploads` volumes are
untouched — only the API/web containers are rebuilt.

---

## 11. Troubleshooting

| Symptom                                              | Likely cause / fix                                                                 |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `./scripts/deploy.sh up` errors `permission denied`  | `sudo chmod +x scripts/*.sh`                                                       |
| Build fails with "Cannot connect to Docker daemon"   | Run `sudo systemctl start docker` and re-login so the `docker` group applies       |
| Container `hrms-mongo` keeps restarting              | `MONGO_ROOT_PASSWORD` contains a `$` or quote — wrap it in single-quotes in `.env` |
| API logs `Invalid environment variables`             | A required `.env` field is empty or too short. Re-check section 3                  |
| Web shows but API calls 502                          | API container is unhealthy. Run `docker logs hrms-api` to see the real error       |
| `JWT_SECRET must be at least 32 characters`          | Re-run `openssl rand -hex 64` and paste the *full* output                          |
| `Weak/placeholder secrets detected in production`    | You left a sample value in `.env`. Replace ALL `CHANGE_ME_*` placeholders          |
| Login works but uploads fail                         | The `hrms_uploads` volume is full or permissions are wrong; `docker volume inspect hrms_hrms_uploads` |
| Free RAM is low and builds fail                      | Add 4 GB swap (step 1.4) and rebuild                                               |

To completely reset and start over:
```bash
./scripts/deploy.sh nuke         # removes containers + ALL data
./scripts/deploy.sh up
./scripts/deploy.sh seed
```

---

## 12. What's in this package — file map

```
DDOPC-HRMS-Deploy/
├── DEPLOY.md                    ← this guide
├── README.md                    ← project overview
├── .env.production              ← env template (copy → .env)
├── .dockerignore                ← keeps Docker builds tight
├── .gitignore
├── package.json                 ← root workspace manifest
├── turbo.json                   ← Turborepo config
├── apps/
│   ├── api/                     ← Express.js + Socket.io backend
│   └── web/                     ← React + Vite dashboard
├── packages/
│   ├── shared/                  ← shared types/validators/constants
│   └── config/                  ← shared TS / ESLint configs
├── docker/
│   ├── docker-compose.yml       ← stack definition (5 services)
│   ├── Dockerfile.api           ← API multi-stage build
│   ├── Dockerfile.web           ← Web multi-stage build (Nginx)
│   └── nginx.conf               ← Nginx routing + SPA fallback
├── data-export/                 ← snapshot of your local DB + uploads
│   ├── MANIFEST.txt             ←   metadata (when, what, sizes)
│   ├── mongo.archive.gz         ←   gzipped mongodump archive
│   └── uploads/                 ←   payslips/documents/policies/backups
├── scripts/
│   ├── deploy.sh                ← one-shot deploy / logs / stop / nuke
│   ├── export-local-data.sh     ← (laptop) snapshot local DB → data-export/
│   ├── import-data.sh           ← (VPS) restore data-export/ into the stack
│   ├── backup.sh                ← Mongo backup (used by cron)
│   └── restore.sh               ← Mongo restore from a backup
└── docs/                        ← additional reference docs
```

---

**Done.** Your HRMS is live on `http://YOUR_VPS_IP` (or
`https://app.yourdomain.com` after step 7).
