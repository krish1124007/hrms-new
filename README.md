# HRMS — Business Management Platform

A self-hosted, single-company HRMS / Business Management Platform covering HR,
attendance, payroll, CRM, projects, inventory, and field-sales modules.

> 🚀 **Deploying to a Hostinger VPS?** Read **[DEPLOY.md](./DEPLOY.md)** —
> step-by-step guide that takes you from a fresh VPS to a live app in ~20 min.

---

## What's in this package

This is the **deployment build** of HRMS. The mobile app, e2e tests, and load
tests have been removed — only the **web dashboard** and **API** are deployed.

```
.
├── DEPLOY.md            ← Hostinger VPS deployment guide (start here)
├── .env.production      ← Environment template — copy to .env and fill in
├── apps/
│   ├── api/             ← Express.js + Socket.io backend
│   └── web/             ← React 19 + Vite 6 dashboard
├── packages/
│   ├── shared/          ← shared types, validators, constants
│   └── config/          ← shared TS configs
├── docker/
│   ├── docker-compose.yml   ← 5-service stack (web, api, mongo, redis, meili)
│   ├── Dockerfile.api
│   ├── Dockerfile.web
│   └── nginx.conf       ← Nginx proxy + SPA fallback
└── scripts/
    ├── deploy.sh        ← one-shot deploy / logs / stop / nuke
    ├── backup.sh        ← MongoDB backup (cron-friendly)
    └── restore.sh       ← MongoDB restore
```

---

## Tech Stack

| Layer            | Technology                                                          |
| ---------------- | ------------------------------------------------------------------- |
| **Frontend**     | React 19, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui             |
| **State / Data** | Zustand, TanStack React Query, React Hook Form, Zod                 |
| **Backend**      | Node.js 22 LTS, Express.js 5, TypeScript                            |
| **Database**     | MongoDB 8 (Mongoose 8)                                              |
| **Cache / Queue**| Redis 7 (ioredis), BullMQ                                           |
| **Search**       | Meilisearch                                                         |
| **Auth**         | Passport.js, JWT (access + refresh)                                 |
| **Real-time**    | Socket.io                                                           |
| **i18n**         | react-i18next (18 languages, RTL support)                           |
| **DevOps**       | Docker, Docker Compose, Nginx                                       |

---

## Quick start — TL;DR

On the VPS:

```bash
# 1. Install Docker (one-liner)
curl -fsSL https://get.docker.com | sudo sh

# 2. Upload + extract this package to /opt/hrms

# 3. Configure env
cd /opt/hrms
cp .env.production .env
nano .env       # paste secrets generated with: openssl rand -hex 64

# 4. Build + start the stack
chmod +x scripts/*.sh
./scripts/deploy.sh up

# 5. Load data — pick ONE
./scripts/import-data.sh        # restore your existing local DB + uploads
# OR
./scripts/deploy.sh seed        # start fresh with admin@example.com / Admin@123
```

Open `http://YOUR_VPS_IP` and log in. **Change the default password
immediately.** For HTTPS + domain setup see [DEPLOY.md](./DEPLOY.md) §7.

> 📦  This zip already contains a snapshot of your local database in
> `data-export/`. To refresh it before redeploying, run on your laptop:
> `./scripts/export-local-data.sh`

---

## Default Roles

| Role            | Capabilities                                  |
| --------------- | --------------------------------------------- |
| `admin`         | Full access to all modules and settings       |
| `hr_manager`    | HR operations including payroll               |
| `hr_executive`  | HR operations excluding payroll               |
| `manager`       | Team management, approvals                    |
| `employee`      | Self-service only                             |

---

## Architecture

- **Single MongoDB database**, no tenant isolation, no SaaS billing
- All users belong to one company
- Auth via JWT bearer tokens
- File storage on disk (Docker volume `hrms_uploads`)
- WebSocket real-time updates via Socket.io
- Background jobs via BullMQ (runs in-process inside the API container)

---

## Local development (optional)

If you want to run the app on your laptop without Docker:

```bash
npm install
cp .env.production .env       # then edit values for localhost
npm run dev                   # starts API + web concurrently via Turbo
```

API: `http://localhost:4000`  ·  Web: `http://localhost:5173`

---

## License

Proprietary — © Your Company. All rights reserved.
