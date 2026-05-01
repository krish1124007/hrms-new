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
npm run seed               # creates default roles + admin user
npm run dev                # starts on http://localhost:4000
```

Default admin login: `admin@example.com` / `Admin@123` (change immediately).

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

The two folders are independent — deploy each wherever you want.

### Backend → any Node host

Render, Railway, Fly.io, a VPS, etc. Build command + start command:

```
build:  npm install && npm run build
start:  npm start
```

Environment variables: copy from `backend/.env.example` and fill in real values.
Set `CORS_ORIGIN` to the public URL of your deployed frontend.

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
