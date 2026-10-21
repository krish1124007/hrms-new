# D-HRMS

The HR system of Dharmesh Deshani Group of Companies (DDIPL): employees, attendance, leave,
payroll, expenses and field sales with maps.

Two independent projects, a Node/Express **backend** and a React/Vite **frontend**; each can be
installed, run and deployed on its own. The mobile app (React Native) lives in `dhrms-iosfinal/`,
which is its own repository and is not tracked here.

```
.
├── backend/    Express + MongoDB API
├── frontend/   React + Vite web app
└── docs/       deploy checklist, production audit, plans
```

---

## Run locally

You need **Node.js 22+**, **MongoDB** and **Redis** (background jobs such as the attendance day
close and backups, plus caching and rate limits; without Redis the API still runs, with those
degraded). Meilisearch is optional (global search). Install them any way you like: Homebrew, Docker,
MongoDB Atlas free tier, etc.

### 1. Backend

```bash
cd backend
cp .env.example .env       # set MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, …
npm ci
npm run seed               # creates / refreshes the system roles (no users)
npm run dev                # starts on http://localhost:4000
```

Every variable the API reads is listed in `backend/.env.example` with what it does. Outside
production an unconfigured mail transport only logs e-mails; in production the API refuses to start
without `SMTP_HOST` or `RESEND_API_KEY` unless `ALLOW_NO_MAIL=true`.

### 2. First admin

There are no default credentials. Create the first admin once:

```bash
cd backend
ADMIN_EMAIL=you@company.com ADMIN_PASSWORD='a strong password' \
ADMIN_FIRST_NAME=Jane ADMIN_LAST_NAME=Doe npm run seed:admin
```

The four `ADMIN_*` variables can also go in `backend/.env` (clear `ADMIN_PASSWORD` afterwards). The
password must pass the normal password policy. Re-running is safe: an existing user keeps their
password and is only given the admin role. On a built deploy use
`node dist/scripts/seed-admin.js` (see [`docs/deploy-checklist.md`](docs/deploy-checklist.md)).

### 3. Frontend

In a new terminal:

```bash
cd frontend
cp .env.example .env       # VITE_API_URL points to the backend's /api/v1
npm ci
npm run dev                # starts on http://localhost:5173
```

Open `http://localhost:5173` and sign in with the admin you created.

---

## Scripts

### Backend (`cd backend`)

| Command | What it does |
|---|---|
| `npm run dev` | API with reload (`tsx watch`) |
| `npm run build` / `npm start` | compile to `dist/` / run `dist/index.js` |
| `npm run seed` | create or refresh the five system roles; idempotent, never touches users |
| `npm run seed:admin` | create the first admin from the `ADMIN_*` variables |
| `npm run backups:relocate` | move old backups out of the upload folder (one-off, see the deploy checklist) |
| `npm run salary:fix-stash` | report employees whose `salary.otherAllowances` still hold the PF / ESIC / PT / net pay / CTC figures old CSV imports parked there (and that inflate `grossSalary`); add `-- --apply` to remove them and recompute the gross |
| `npm run migrate:status` / `migrate:up` / `migrate:down` / `migrate:create` | database migrations (`migrate-mongo`, `backend/migrations/`) |
| `npm run migrate:lint` | check the migration files |
| `npm run db:audit-indexes` | read-only report of duplicate / overlapping indexes |
| `npm run type-check` | `tsc --noEmit` |
| `npm run lint` | ESLint (`backend/eslint.config.js`) |
| `npm test` | Vitest (in-memory MongoDB and Redis mock, no services needed) |

Every script in `src/scripts/` is also compiled to `dist/scripts/`, so on a server without dev
dependencies run e.g. `node dist/scripts/fix-salary-stash.js` (dry run) and then
`node dist/scripts/fix-salary-stash.js --apply`.

### Frontend (`cd frontend`)

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | type-check, then build to `dist/` |
| `npm run preview` | serve the built `dist/` |
| `npm run type-check` | `tsc -b --noEmit` |
| `npm run lint` | ESLint (`frontend/eslint.config.js`) |
| `npm test` | Vitest + Testing Library (jsdom) |
| `npm run test:coverage` | tests with a coverage report |

---

## Checks and CI

Before committing, run in **both** `backend/` and `frontend/`:

```bash
npm run type-check
npm run lint        # must exit 0; warnings are allowed (old code), errors are not
npx vitest run
```

and `npm run build` in `frontend/`. GitHub Actions runs the same steps
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) on every push and pull request to `main`
and `phases-*` branches, on Node 22. CI never builds into or checks the committed `dist/` folders.

ESLint uses the flat config with `typescript-eslint` recommended rules (plus `react-hooks` and
`react-refresh` on the web). Rules the existing code still breaks are warnings; turn them back to
errors once their warnings are gone.

---

## Deploy

**Production server (`hrms.ddipl.org`: nginx + pm2 + local MongoDB/Redis):** follow
[`docs/deploy-checklist.md`](docs/deploy-checklist.md). `backend/dist` and `frontend/dist` are
committed, so the server deploys with `git pull` and builds nothing. Rebuild them before a release
with `cd backend && npm run clean && npm run build` and `cd frontend && npm run clean && npm run build`,
then commit them.
Deploying Phase 2 (attendance, leave, payroll, approvals) adds its own steps: [Phase 2 — HR logic](docs/deploy-checklist.md#phase-2--hr-logic-attendance-leave-payroll-approvals).

Anywhere else: the two folders are independent — deploy each wherever you want.

### Backend → any Node host

Render, Railway, Fly.io, a VPS, etc. Build command + start command:

```
build:  npm ci && npm run build
start:  npm start
```

Environment variables: copy from `backend/.env.example` and fill in real values.
Set `CORS_ORIGIN` to the public URL of your deployed frontend. Set `HOST=127.0.0.1` when a reverse
proxy on the same machine fronts the API (the default is `0.0.0.0`, all interfaces).

You also need a managed MongoDB (e.g. MongoDB Atlas) and a Redis.

### Frontend → any static host

Vercel, Netlify, Cloudflare Pages, S3 + CloudFront, etc.

```
build:        npm ci && npm run build
output dir:   dist
```

Environment variables: set `VITE_API_URL` to your deployed backend's `/api/v1`.

---

## Tech stack

**Backend:** Node 22, Express 5, TypeScript (ESM), MongoDB (Mongoose 8), Redis, BullMQ, Socket.io,
JWT auth, Vitest.
**Frontend:** React 19, Vite 6, TypeScript, Tailwind 4, TanStack Query, React Router 7, Zustand,
Leaflet / OpenStreetMap, Vitest.
