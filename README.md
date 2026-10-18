# HRMS

Two independent projects: a Node/Express **backend** and a React/Vite **frontend**.
Each can be installed, run, and deployed on its own.

```
hrms-new/
├── backend/    Express + MongoDB API
└── frontend/   React + Vite dashboard
```

---

## Run locally

You need **Node.js 22+**, **MongoDB**, and (optionally) **Redis** running.
Install Mongo + Redis any way you like — Homebrew, MongoDB Atlas free tier, etc.

### 1. Backend

```bash
cd backend
cp .env.example .env       # edit MONGODB_URI, JWT_SECRET, etc.
npm install
npm run seed               # creates the default roles (no users)
ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a strong password' ADMIN_FIRST_NAME=Jane ADMIN_LAST_NAME=Doe npm run seed:admin   # creates the first admin
npm run dev                # starts on http://localhost:4000
```

### 2. Frontend

In a new terminal:

```bash
cd frontend
cp .env.example .env       # VITE_API_URL points to the backend
npm install
npm run dev                # starts on http://localhost:5173
```

Open `http://localhost:5173` and log in.

---

## Deploy

**Production server (`hrms.ddipl.org`: nginx + pm2 + local MongoDB/Redis):** follow
[`docs/deploy-checklist.md`](docs/deploy-checklist.md). `backend/dist` and `frontend/dist` are
committed, so the server deploys with `git pull` and builds nothing. Rebuild them before a release
with `cd backend && npm run clean && npm run build` and `cd frontend && npm run clean && npm run build`,
then commit them. Note that in production the API refuses to start without a mail transport
(`SMTP_HOST` or `RESEND_API_KEY`) unless `ALLOW_NO_MAIL=true`.
Deploying Phase 2 (attendance, leave, payroll, approvals) adds its own steps: [Phase 2 — HR logic](docs/deploy-checklist.md#phase-2--hr-logic-attendance-leave-payroll-approvals).

Anywhere else: the two folders are independent — deploy each wherever you want.

### Backend → any Node host

Render, Railway, Fly.io, a VPS, etc. Build command + start command:

```
build:  npm install && npm run build
start:  npm start
```

Environment variables: copy from `backend/.env.example` and fill in real values.
Set `CORS_ORIGIN` to the public URL of your deployed frontend. Set `HOST=127.0.0.1` when a reverse
proxy on the same machine fronts the API (the default is `0.0.0.0`, all interfaces).

You also need a managed MongoDB (e.g. MongoDB Atlas) and optionally a managed Redis.

### Frontend → any static host

Vercel, Netlify, Cloudflare Pages, S3 + CloudFront, etc.

```
build:        npm install && npm run build
output dir:   dist
```

Environment variables: set `VITE_API_URL` to your deployed backend's `/api/v1`.

---

## Tech stack

**Backend:** Node 22, Express 5, TypeScript, MongoDB (Mongoose), Redis, BullMQ, Socket.io, JWT auth.
**Frontend:** React 19, Vite 6, TypeScript, Tailwind 4, TanStack Query, React Router 7, Zustand, i18next.
