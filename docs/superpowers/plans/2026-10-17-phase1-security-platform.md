# Phase 1 — Security & Platform Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every P0 and the platform-level P1s from the audit so the system can be deployed without exposing data, granting admin to strangers, crashing on file downloads, or silently failing to send mail — while keeping the current `git pull && pm2 restart all` deploy working.

**Architecture:** Backend gets an app factory (`createApp()`) so it can be tested with supertest + in-memory Mongo + mocked Redis; uploads stop being static-served and are reached only through short-lived HMAC-signed URLs rewritten into every JSON response; permissions become a single catalogue that routes, seeds, and the Roles UI all read; public registration is deleted and replaced with an env-driven admin bootstrap and a working invite/activation flow. Frontend removes signup, fixes the broken auth pages and dead links, and makes `npm run build` fail on type errors.

**Tech Stack:** Node 22, Express 5, Mongoose 8, ioredis, BullMQ, zod, pino, vitest 2 + supertest + mongodb-memory-server + ioredis-mock (backend); React 19, Vite 6, TanStack Query, React Router 7 (frontend).

**Spec:** `docs/production-audit.md` — sections 2 (items 1–7, 10–12), 3.1, 3.2, 3.6 (P1 rows), 3.8, 3.9.

## Global Constraints

- Branch: all work on `production-hardening`, branched from `main` at `cdc2488`. Commit per task; never push.
- Deploy contract stays: `backend/dist` and `frontend/dist` remain committed and rebuilt before each phase's final commit; the server keeps doing `git pull && npm install && pm2 restart all`.
- Source becomes tracked: `.gitignore` must no longer exclude `**/src/`, `**/*.ts`, `**/*.tsx`, `**/tsconfig*.json`, `**/vite.config.ts`.
- Backend `npm run type-check` and `npm test` must pass at the end of every task; frontend `npm run type-check` must pass at the end of Task 12 and `npm run build` must run type-check first.
- No new public (unauthenticated) routes except `GET /api/v1/files/*` (signature-protected) and `POST /api/v1/auth/accept-invite`.
- Existing production data must keep working: stored file URLs of the form `/uploads/<key>` stay valid (the presigner converts them on output); no migration is required by this phase.
- Secrets never appear in tests, docs, or commits. Test env values live only in `backend/src/test/setup.ts`.
- Copy: the product name in new UI strings is **DD HRMS**.

## Review Focus

1. A payslip, document or receipt URL stored in Mongo **before** this change (`/uploads/documents/2026/05/...jpeg`) must still download for an authorised user after it — test in Task 6 (presigner rewrites legacy `/uploads/` strings).
2. A signed URL copied into a chat and opened after 10 minutes must be refused with 401, not serve the file — test in Task 6.
3. An uploaded `.html`/`.svg` must never render on the app origin — test in Task 6 (attachment disposition + nosniff).
4. A user whose refresh token has been revoked server-side must land on `/login` with a clean store, not bounce between `/dashboard` and `/login` — test in Task 12.
5. Deploying this phase to the existing server must not lock everyone out: the seeded `admin` role keeps `*`, existing admins keep working, and `npm run seed` refreshes the system roles without touching users — test in Task 9 (seed is idempotent and preserves `*`).

---

### Task 1: Branch, track source, normalise line endings

**Files:**
- Modify: `.gitignore`
- Create: `.gitattributes`

- [ ] **Step 1: Create the branch**

```bash
git checkout -b production-hardening
```

- [ ] **Step 2: Rewrite `.gitignore`** — remove the lines `**/src/`, `**/*.ts`, `**/*.tsx`, `**/tsconfig*.json`, `**/vite.config.ts`, `**/.eslintrc*`, `**/.prettier*`, and the `!**/dist/` / `!backend/migrations/` allow-rules (no longer needed). Keep `node_modules/`, `*.tsbuildinfo`, env rules, logs, `uploads/`, `backups/`, OS junk, `dhrms-iosfinal/`. Add `.claude/` and `backend/uploads/`.

- [ ] **Step 3: Create `.gitattributes`** with exactly:

```
* text=auto eol=lf
*.png binary
*.jpg binary
*.jpeg binary
*.gz binary
*.pdf binary
```

- [ ] **Step 4: Normalise and stage everything**

```bash
git add --renormalize .
git add -A
git status --short | wc -l
```
Expected: `backend/src/**`, `frontend/src/**`, tsconfigs, vite config and the two docs appear as added; the CRLF-only "modified" files disappear from the diff; `data-export/` and the stray `.cjs` scripts show as deleted.

- [ ] **Step 5: Commit**

```bash
git commit -m "chore: track source, normalise line endings, remove exported data and scratch scripts"
```

---

### Task 2: Backend test harness + app factory

**Files:**
- Create: `backend/vitest.config.ts`, `backend/src/test/setup.ts`, `backend/src/test/factories.ts`, `backend/src/test/app.test.ts`
- Create: `backend/src/app.ts` (replace the dead file of the same name)
- Modify: `backend/src/index.ts` (bootstrap uses `createApp`), `backend/package.json` (devDeps `ioredis-mock`, `@types/supertest` exists), `backend/tsconfig.json` (exclude `src/**/*.test.ts` already; add `"types": ["node", "vitest/globals"]` only if globals are used — they are not; keep explicit imports)

**Interfaces:**
- Produces: `createApp(): Express` in `backend/src/app.ts` — builds the full middleware chain, routes, error handler exactly as `index.ts` does today, but does **not** listen, connect Mongo/Redis, start workers, or register sockets.
- Produces: `backend/src/test/factories.ts` → `createRole(slug: 'admin'|'hr_manager'|'hr_executive'|'manager'|'employee'): Promise<IRole>` (upserts from `DEFAULT_ROLES`), `createUser(opts: { roleSlug: string; email?: string; password?: string }): Promise<{ user: IUser; token: string }>` (token = `user.generateAccessToken()`), `createEmployeeFor(user: IUser): Promise<IEmployee>`.
- Produces: `backend/src/test/setup.ts` — starts `MongoMemoryServer`, connects mongoose, mocks `../config/redis.js` with `ioredis-mock` (export `redis`, `disconnectRedis`), mocks `../jobs/backup.jobs.js` (`enqueueBackupCreate`, `enqueueBackupRestore`, `getMonthlyBackupSchedule`, `setMonthlyBackupSchedule`, `startBackupWorker` as `vi.fn()`), sets `process.env` (`NODE_ENV=test`, `JWT_SECRET`/`JWT_REFRESH_SECRET`/`ENCRYPTION_KEY` 48-char dummies, `UPLOAD_DIR=<os.tmpdir()>/hrms-test-uploads`, `CORS_ORIGIN=http://localhost:5173`), and clears all collections `afterEach`.

- [ ] **Step 1: Install test deps**

```bash
cd backend && npm install --save-dev ioredis-mock@8 --no-audit --no-fund
```

- [ ] **Step 2: Write `backend/vitest.config.ts`**: `environment: 'node'`, `include: ['src/**/*.test.ts']`, `setupFiles: ['src/test/setup.ts']`, `testTimeout: 30000`, `hookTimeout: 120000`, `pool: 'forks'`, `fileParallelism: false`.

- [ ] **Step 3: Write the failing test `backend/src/test/app.test.ts`**

```ts
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('createApp', () => {
  it('serves health at /api/v1/health and returns the standard 404 envelope', async () => {
    const app = createApp();
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
```

- [ ] **Step 4: Run it to verify it fails**

Run: `cd backend && npx vitest run src/test/app.test.ts`
Expected: FAIL — `createApp` is not exported (the old `app.ts` exports a different, dead factory).

- [ ] **Step 5: Implement `createApp()`** — move the body of `bootstrap()` from the `const app = express()` line through `app.use(errorMiddleware)` into `backend/src/app.ts` as `export function createApp(): Express`, deleting the old file's contents entirely (its `cors({origin:'*'})` and `console.log(req.body)` go away). Also mount `healthRoutes` at both `/api` and `/api/v1` (fixes the health-path mismatch). `index.ts` becomes: connect DB → Redis ping → `const app = createApp()` → `createServer(app)` → sockets → listen → workers → shutdown handlers.

- [ ] **Step 6: Write `setup.ts` and `factories.ts`** as specified in Interfaces.

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/test/app.test.ts`
Expected: PASS (first run downloads the MongoDB binary; allow ~2 min).

- [ ] **Step 8: Type-check and commit**

```bash
cd backend && npm run type-check && git add -A && git commit -m "test(backend): vitest harness with in-memory Mongo, mocked Redis, and createApp() factory"
```

---

### Task 3: Remove public registration; env-driven admin bootstrap

**Files:**
- Modify: `backend/src/routes/auth.routes.ts` (delete `/register` line and the `registerSchema` import), `backend/src/controllers/auth.controller.ts` (delete `register`), `backend/src/validators/auth.validators.ts` (delete `registerSchema`/`RegisterInput`), `backend/src/scripts/seed-admin.ts` (read `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME` from env; refuse to run if any is missing; **never** overwrite an existing user's password — if the email exists, only ensure role `admin` and `status: 'active'` and print "already exists"), `backend/package.json` (`"seed:admin": "tsx src/scripts/seed-admin.ts"`), `backend/.env.example` (document the four `ADMIN_*` keys), `README.md` (replace the `admin@example.com / Admin@123` paragraph with the `npm run seed && ADMIN_EMAIL=… npm run seed:admin` instructions)
- Test: `backend/src/controllers/auth.register.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('POST /auth/register no longer exists', async () => {
  const res = await request(createApp()).post('/api/v1/auth/register').send({
    firstName: 'A', lastName: 'B', email: 'a@b.com', password: 'Str0ng!Passw0rd', acceptTerms: true, acceptPrivacy: true,
  });
  expect(res.status).toBe(404);
  expect(await User.countDocuments()).toBe(0);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/controllers/auth.register.test.ts` → FAIL (201).
- [ ] **Step 3: Delete the route, controller, validator; rewrite `seed-admin.ts`; add the npm script and docs.**
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): remove public registration; admin bootstrap from env"`

---

### Task 4: Rate limiting back on; lockout cannot be weaponised

**Files:**
- Modify: `backend/src/middleware/rate-limit.middleware.ts`, `backend/src/controllers/auth.controller.ts:160-200`
- Test: `backend/src/middleware/rate-limit.test.ts`, `backend/src/controllers/auth.login.test.ts`

**Interfaces:**
- `buildLimiter` keeps its signature; `authRateLimit` = `{ windowMs: 15*60_000, max: 20, keyPrefix: 'auth', scope: 'ip' }`; responses over `max` return `429 { success:false, error:{ code:'RATE_LIMITED' } }` with `Retry-After`.
- Lockout helpers take `(email: string, ip: string)` and key on `login-fail:<email>:<ip>` / `login-lock:<email>:<ip>`; `trackLoginFailure` is only called when the user **exists** (unknown emails are not tracked).

- [ ] **Step 1: Write the failing tests**

```ts
// rate-limit.test.ts — call authRateLimit 21 times with the same req.ip; expect next() 20 times and a 429 JSON on the 21st.
// auth.login.test.ts — (a) 5 wrong passwords for an existing user from ip A → 6th attempt from ip A returns 401 "Account locked"; same user from ip B with the correct password → 200.
//                      (b) 5 attempts for a non-existent email → no `login-fail:*` key is created in redis.
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** — restore the commented block (use `redis.ttl(key)` for `Retry-After`); change lockout key shape; in `login`, read `req.ip ?? 'unknown'` and call `recordFailure` only after `user` is found (keep the generic `Invalid credentials` message for both cases).
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `git commit -m "fix(auth): enforce 429 rate limits; scope lockout to email+ip and only for existing accounts"`

---

### Task 5: Static-file crash in compression telemetry

**Files:**
- Modify: `backend/src/middleware/compression-telemetry.middleware.ts:31-39`
- Test: `backend/src/middleware/compression-telemetry.test.ts`

- [ ] **Step 1: Write the failing test** — build a bare `express()` app with `compressionTelemetry` then `express.static(<tmp dir containing a 64 KB file>)`; `await request(app).get('/big.txt')`; assert `status === 200` and that no `uncaughtException` fired (register a `process.once('uncaughtException', spy)` and assert `spy` not called).
- [ ] **Step 2: Run to verify it fails** (the stream's `end()` throws `ERR_HTTP_HEADERS_SENT`).
- [ ] **Step 3: Implement** — in the wrapped `end`, only call `res.setHeader` when `!res.headersSent`; otherwise skip the header.
- [ ] **Step 4: Run to verify it passes.**
- [ ] **Step 5: Commit** — `git commit -m "fix(http): never set X-Compression-Ratio after headers are sent (crashed on static files)"`

---

### Task 6: Private uploads with signed URLs; upload allow-list

**Files:**
- Create: `backend/src/lib/file-urls.ts`, `backend/src/routes/files.routes.ts`, `backend/src/middleware/presign-response.middleware.ts`, `backend/src/lib/upload-policy.ts`
- Modify: `backend/src/app.ts` (remove `express.static('/uploads')`; add `app.use(presignResponse)` right after `express.json`; mount `filesRoutes` at `/api/v1/files` **before** `apiRoutes`), `backend/src/config/env.ts` (add `PUBLIC_BASE_URL: z.string().url().optional()` and `FILE_URL_TTL_SECONDS: z.coerce.number().default(600)`), `backend/src/routes/document.routes.ts`, `backend/src/routes/hr-policies.routes.ts`, `backend/src/routes/expense-claims.routes.ts`, `backend/src/routes/employees.routes.ts` (every multer instance gets `fileFilter: uploadFileFilter`), `backend/src/services/payslip-pdf.service.ts:611` (key → `payslips/${yyyy}-${mm}/${employee.employeeId}-${randomBytes(6).toString('hex')}.pdf`), `frontend/vite.config.ts` (drop the `/uploads` proxy)
- Test: `backend/src/lib/file-urls.test.ts`, `backend/src/routes/files.routes.test.ts`, `backend/src/middleware/presign-response.test.ts`

**Interfaces:**
- `signFileUrl(keyOrUrl: string, ttlSeconds = env.FILE_URL_TTL_SECONDS): string` → absolute URL `${env.PUBLIC_BASE_URL ?? env.CORS_ORIGIN}/api/v1/files/<key>?exp=<unix>&sig=<hex>`; strips a leading `/uploads/`. Signature = HMAC-SHA256 over `${key}\n${exp}` keyed by `env.JWT_SECRET + ':files'`.
- `verifyFileSignature(key: string, exp: string, sig: string): boolean` — constant-time compare; false when `exp < now`.
- `GET /api/v1/files/*` — no auth middleware; 401 `{ code:'INVALID_FILE_SIGNATURE' }` when the signature is missing/invalid/expired; 404 when the key resolves outside `UPLOAD_DIR` or the file is missing; streams with `Content-Type` from extension (`mime-types` is already a transitive dep; add it to `dependencies`), `X-Content-Type-Options: nosniff`, and `Content-Disposition: inline` only for `application/pdf` and `image/(png|jpeg|gif|webp)`, `attachment` for everything else.
- `presignResponse(req, res, next)` — wraps `res.json(body)`: deep-walks plain objects/arrays and replaces every string that starts with `/uploads/` with `signFileUrl(value)`; skips `Date`, `ObjectId`, Buffers; leaves other strings untouched.
- `uploadFileFilter` — multer `fileFilter` allowing extensions `pdf png jpg jpeg webp gif doc docx xls xlsx csv` and MIME prefixes `image/`, `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.*`, `application/vnd.ms-excel`, `text/csv`; rejects with `AppError('File type not allowed', 400, 'UNSUPPORTED_FILE_TYPE')`.

- [ ] **Step 1: Write the failing tests**

```ts
// file-urls.test.ts
it('round-trips a signature and strips /uploads/', ...);          // signFileUrl('/uploads/a/b.pdf') contains '/api/v1/files/a/b.pdf?exp='
it('rejects a tampered key', ...);                                 // verifyFileSignature('a/c.pdf', exp, sig) === false
it('rejects an expired signature', ...);                           // exp in the past → false
// files.routes.test.ts (write a file into UPLOAD_DIR first)
it('401 without a signature', ...);
it('200 + attachment for .html with a valid signature', ...);     // headers['content-disposition'] starts with 'attachment'; 'x-content-type-options' === 'nosniff'
it('200 + inline for .pdf', ...);
it('404 for path traversal', ...);                                // key '../../etc/passwd' (signed) → 404
// presign-response.test.ts
it('rewrites nested legacy /uploads/ strings and leaves others alone', ...); // { a: { url: '/uploads/x.pdf' }, b: ['/uploads/y.png', 'plain'] }
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement the four modules, mount them, remove the static mount, add the fileFilter to every multer instance, randomise the payslip key, drop the Vite proxy.**
- [ ] **Step 4: Run the whole backend suite**: `npx vitest run` → PASS; `npm run type-check` → 0 errors.
- [ ] **Step 5: Commit** — `git commit -m "feat(files): signed, short-lived download URLs replace public /uploads; upload type allow-list"`

---

### Task 7: Backup API gated and restore made safe

**Files:**
- Create: `backend/src/models/system-setting.model.ts` (`{ key: string (unique), value: Mixed }`), `backend/src/lib/shell.ts` (`run(cmd: string, args: string[]): Promise<void>` using `execFile` promisified, 30-min timeout)
- Modify: `backend/src/routes/backup.routes.ts` (GET → `requirePermission('backups.view')`; PUT/POST/DELETE → `requirePermission('backups.manage')`), `backend/src/controllers/backup.controller.ts` (`restoreBackupSchema` becomes `z.object({})`; `restoreBackup` reads `env.BACKUP_SCRATCH_MONGO_URI`, 400 `RESTORE_TARGET_NOT_CONFIGURED` when unset; `deleteBackup` also `deleteFile(key)` for the tarball and `.counts.json`), `backend/src/jobs/backup.jobs.ts` (replace all `execSync` with `await run(...)`; replace `fs.readFileSync(tarPath)` + `saveFile` with `fs.promises.copyFile(tarPath, pathFor(key))` after `mkdir -p`; `runRestore` takes the URI from `env`, not job data), `backend/src/config/env.ts` (`BACKUP_SCRATCH_MONGO_URI: z.string().url().optional()`), `backend/src/index.ts` (replace unconditional `setMonthlyBackupSchedule(true)` with reading `SystemSetting 'backup.monthlyEnabled'`, default `true`), `backend/src/controllers/backup.controller.ts#updateSchedule` (persist the toggle to `SystemSetting`)
- Test: `backend/src/routes/backup.routes.test.ts`

- [ ] **Step 1: Write the failing tests** — employee token → `GET /api/v1/backups` 403 and `POST /api/v1/backups` 403; admin token → `GET` 200; admin `POST /api/v1/backups/<id>/restore` with `BACKUP_SCRATCH_MONGO_URI` unset → 400 `RESTORE_TARGET_NOT_CONFIGURED`; `PUT /schedule {enabled:false}` then `SystemSetting.findOne({key:'backup.monthlyEnabled'})` has `value:false`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify they pass.**
- [ ] **Step 5: Commit** — `git commit -m "fix(backups): permission-gate the API, remove shell interpolation, persist schedule, delete files on delete"`

---

### Task 8: Ownership and permission gates on the open modules

**Files:**
- Create: `backend/src/lib/access.ts`
- Modify: `backend/src/routes/notice.routes.ts` (POST/PATCH/DELETE → `requirePermission('notices.manage')`), `backend/src/routes/location.routes.ts` (POST/PATCH/DELETE/`:id/employees` → `requirePermission('locations.manage')`), `backend/src/controllers/overtime.controller.ts` (`get`/`update`/`remove`: 403 unless own request or `overtime.view`; `create`: ignore `body.employee` unless `overtime.view`), `backend/src/controllers/attendance.controller.ts#monthly` (honour `employeeId` query only with `attendance.view`), `backend/src/controllers/expense-claims.controller.ts` (`listClaims`/`getClaim`/`updateClaim`/`deleteClaim`: scope to own employee unless `expenses.approve`; `createClaim`: drop `body.employeeId` unless `expenses.approve`; `approveClaim`/`rejectClaim`: 403 `SELF_APPROVAL` when claim.employeeId is the caller's; `deleteClaim`: 400 unless status `draft`/`pending`), `backend/src/controllers/leaves.controller.ts` (`applyLeave`: `employeeId` other than self requires `leaves.update`; `approveLeaveRequest`/`rejectLeaveRequest`: 403 `SELF_APPROVAL` when own), `backend/src/controllers/hr-policies.controller.ts#acknowledge` (employee resolved from `req.user`, body `employee` ignored), `backend/src/controllers/field-visits.controller.ts`, `field-orders.controller.ts`, `field-payments.controller.ts`, `field-tasks.controller.ts`, `field-tracking.controller.ts` (every list/get/update: scope to the caller's employee unless `field-sales.manage`; every create: `employeeId` = caller's unless `field-sales.manage`)
- Test: `backend/src/lib/access.test.ts`, `backend/src/routes/ownership.test.ts`

**Interfaces:**
- `hasPermission(user: Express.Request['user'], perm: string): boolean` (true for `*`).
- `currentEmployeeId(req: Request): Promise<Types.ObjectId | null>` — `Employee.findOne({ userId: req.user._id }).select('_id')`, cached on `req` for the request.
- `assertOwnOrPermission(req: Request, ownerEmployeeId: unknown, perm: string): Promise<void>` — throws `ForbiddenError('You can only access your own records')` otherwise.

- [ ] **Step 1: Write the failing tests** — using two employee users (A, B) each with an Employee record: A `POST /notices` → 403; A `GET /attendance/monthly?employeeId=<B>` → data belongs to A (param ignored) ; A creates an expense claim with `employeeId: <B>` → stored `employeeId` is A; A `GET /expense-claims/requests/<B's claim>` → 403; HR with `leaves.approve` approving **their own** leave → 403 `SELF_APPROVAL`; A `POST /hr-policies/:id/acknowledge { employee: <B> }` → acknowledgement recorded for A; A `GET /field/visits/<B's visit>` → 403.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement `access.ts` and apply it per the Files list.**
- [ ] **Step 4: Run the suite; type-check.**
- [ ] **Step 5: Commit** — `git commit -m "fix(authz): permission gates for notices/locations; ownership scoping for overtime, attendance, expenses, leaves, policies, field"`

---

### Task 9: One permission catalogue; seeded roles that can do their jobs; no privilege escalation

**Files:**
- Create: `backend/src/config/permissions.ts`
- Modify: `backend/src/controllers/roles.controller.ts` (import `PERMISSIONS_BY_MODULE` from config; `createRole`/`updateRole` validate every permission ∈ `ALL_PERMISSIONS` and reject `*` unless caller has `*`), `backend/src/controllers/users.controller.ts` (`updateUser`: `customPermissions` validated the same way; assigning a role whose permissions include `*` requires caller `*`; a caller without `*` cannot grant permissions they lack), `backend/src/models/role.model.ts` (`DEFAULT_ROLES` per table below)
- Test: `backend/src/config/permissions.test.ts`, `backend/src/controllers/roles.escalation.test.ts`, `backend/src/scripts/seed.test.ts`

**Interfaces:**
- `PERMISSIONS_BY_MODULE: Record<string, string[]>` — every string that appears in any `requirePermission('…')` call under `backend/src/routes/**` plus `locations.manage`, `notices.manage`, `backups.view`, `backups.manage`. Remove inert names (`expense-claims.*`, `departments.manage`, `designations.manage`, `shifts.manage`, `projects.manage`, `documents.*`, `employees.export`, `leaves.config`, `settings.view`, `notices.view`).
- `ALL_PERMISSIONS: ReadonlySet<string>`.
- `DEFAULT_ROLES`:
  - `employee`: `attendance.checkin`, `leaves.view`, `leaves.create`, `expenses.view`, `expenses.create`, `expenses.update`, `expenses.delete`, `payroll.view`, `policies.view`, `holidays.view`.
  - `manager`: employee set + `employees.view`, `attendance.view`, `leaves.approve`, `expenses.approve`, `overtime.view`, `overtime.approve`.
  - `hr_executive`: manager set + `employees.create`, `employees.update`, `attendance.manage`, `attendance.approve`, `departments.view`, `designations.view`, `shifts.view`, `holidays.create`, `holidays.update`, `leaves.update`, `assets.view`, `disciplinary.view`, `notices.manage`, `policies.manage`, `events.manage`.
  - `hr_manager`: hr_executive set + `employees.delete`, `payroll.process`, `payroll.config`, `attendance.config`, `departments.create`, `departments.update`, `departments.delete`, `designations.create`, `designations.update`, `designations.delete`, `shifts.create`, `shifts.update`, `shifts.delete`, `holidays.delete`, `leaves.delete`, `assets.manage`, `loans.view`, `loans.manage`, `loans.approve`, `disciplinary.manage`, `locations.manage`, `audit.view`, `field-sales.view`, `field-sales.manage`, `projects.view`, `projects.create`, `projects.update`, `projects.delete`, `backups.view`.
  - `admin`: `['*']` (unchanged).

- [ ] **Step 1: Write the failing tests**

```ts
// permissions.test.ts — glob backend/src/routes/**/*.ts, regex /requirePermission\(([^)]*)\)/g, collect quoted strings; expect every one ∈ ALL_PERMISSIONS; expect every DEFAULT_ROLES permission (except '*') ∈ ALL_PERMISSIONS.
// roles.escalation.test.ts — hr_manager with roles.create creating a role with permissions ['*'] → 403; with ['payroll.view','not.a.permission'] → 400; hr_manager updating a user with customPermissions ['users.delete'] (which hr_manager lacks) → 403.
// seed.test.ts — run the seed function twice; role count stays 5; admin keeps ['*']; a pre-existing user document is untouched.
```

- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite; type-check.**
- [ ] **Step 5: Commit** — `git commit -m "fix(rbac): single permission catalogue, usable seeded roles, escalation checks"`

---

### Task 10: Token hygiene, log redaction, Redis resilience, docs/metrics gating

**Files:**
- Modify: `backend/src/models/user.model.ts:90-92` (`emailVerificationToken`, `passwordResetToken`, `passwordResetExpires` → `select: false`; add `toJSON: { transform }` removing `password`, `passwordHistory`, `refreshTokens`, `emailVerificationToken`, `passwordResetToken`, `passwordResetExpires`), `backend/src/controllers/auth.controller.ts` (`resetPassword`/`verifyEmail`/`acceptInvite` queries add `.select('+passwordResetToken +passwordResetExpires +emailVerificationToken')`), `backend/src/config/logger.ts` (`redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[REDACTED]' }`), `backend/src/config/redis.ts` (export a second client `redisApp` = `new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, enableOfflineQueue: false, commandTimeout: 2000 })`; keep `redis` for BullMQ), `backend/src/lib/token-blacklist.ts`, `backend/src/middleware/rate-limit.middleware.ts`, `backend/src/lib/cache.ts` or wherever `redis` is used for request-path work (switch to `redisApp`), `backend/src/index.ts` (`await Promise.race([redis.ping(), timeout(5000)])` → warn and continue on timeout), `backend/src/app.ts` (mount Swagger + `/api/docs.json` only when `env.NODE_ENV !== 'production' || env.ENABLE_API_DOCS === 'true'`; `/api/metrics` returns 403 unless `req.ip` is loopback or `req.get('x-metrics-token') === env.METRICS_TOKEN`), `backend/src/config/env.ts` (`ENABLE_API_DOCS: z.enum(['true','false']).default('false')`, `METRICS_TOKEN: z.string().optional()`)
- Test: `backend/src/models/user.serialization.test.ts`, `backend/src/config/logger.test.ts`, `backend/src/routes/docs-gating.test.ts`

- [ ] **Step 1: Write the failing tests** — `GET /api/v1/users/:id` as admin after `forgotPassword` ran for that user → body has no `passwordResetToken`; `JSON.parse(JSON.stringify(userDoc))` has none of the six fields; logger with a fake `req.headers.authorization` writes `[REDACTED]` (use a pino destination stream in the test); with `NODE_ENV=production` and `ENABLE_API_DOCS=false`, `GET /api/docs` → 404 and `GET /api/metrics` from a non-loopback IP without token → 403.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite; type-check.**
- [ ] **Step 5: Commit** — `git commit -m "fix(security): hide reset tokens, redact auth headers in logs, fail-fast Redis client, gate docs/metrics"`

---

### Task 11: Working invite, activation, and reset links; mail must exist in production

**Files:**
- Modify: `backend/src/controllers/auth.controller.ts` (add `acceptInvite`; `forgotPassword` link → `${appBaseUrl()}/reset-password?token=${token}`), `backend/src/validators/auth.validators.ts` (`acceptInviteSchema = z.object({ token: z.string().min(10), password: z.string().min(8).max(128) })`), `backend/src/routes/auth.routes.ts` (`POST /accept-invite` with `TIGHT_JSON`, `authRateLimit`, `validate(acceptInviteSchema)`), `backend/src/controllers/users.controller.ts:89` and `backend/src/controllers/employees.controller.ts:253` (link → `${appBaseUrl()}/accept-invite?token=…`), `backend/src/controllers/auth.controller.ts:133` (verify link → `${appBaseUrl()}/verify-email?token=…`), `backend/src/lib/app-url.ts` (`appBaseUrl(): string` = `env.PUBLIC_BASE_URL ?? env.CORS_ORIGIN`), `backend/src/services/email.service.ts` (`sendMail` returns `false` and logs `error` when there is no transport in production instead of pretending success), `backend/src/index.ts` (in production, exit with a clear message unless `SMTP_HOST` or `RESEND_API_KEY` is set, or `ALLOW_NO_MAIL=true`), `backend/src/config/env.ts` (`ALLOW_NO_MAIL: z.enum(['true','false']).default('false')`), `backend/.env.example` (document `PUBLIC_BASE_URL`, `ALLOW_NO_MAIL`, `BACKUP_SCRATCH_MONGO_URI`, `ENABLE_API_DOCS`, `METRICS_TOKEN`, `FILE_URL_TTL_SECONDS`, `COMPANY_GSTIN`, `COMPANY_STATE_CODE`, `GST_RATE_PERCENT`, `ADMIN_*`)
- Test: `backend/src/controllers/auth.invite.test.ts`

**Interfaces:**
- `POST /api/v1/auth/accept-invite { token, password }` → finds `User` by `emailVerificationToken` with `status: 'invited'`; validates password with `validateNewPassword`; sets password, `status: 'active'`, `emailVerified: true`, clears the token, bumps `sessionVersion`; returns `{ success: true, data: { user, accessToken, refreshToken } }` (same shape as login). 400 `INVALID_INVITE` otherwise.

- [ ] **Step 1: Write the failing tests** — create an invited user via `POST /api/v1/users` as admin (mock `sendMail`, capture the HTML, assert the link matches `/accept-invite?token=` and extract the token); `POST /auth/accept-invite` with it → 200 and the user can now log in; reusing the token → 400; `forgotPassword` mail link contains `/reset-password?token=`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the suite; type-check.**
- [ ] **Step 5: Commit** — `git commit -m "feat(auth): accept-invite flow; correct reset/verify links; refuse silent no-mail production boot"`

---

### Task 12: Frontend — remove signup, fix auth pages, dead links, debug alerts, type errors, auth-store reset

**Files:**
- Delete: `frontend/src/pages/auth/RegisterPage.tsx`, `frontend/src/pages/auth/SignupSuccessPage.tsx`, `frontend/src/pages/placeholders/ComingSoonPage.tsx`, `frontend/src/lib/phase1.api.ts`
- Create: `frontend/src/pages/auth/AcceptInvitePage.tsx` (reads `?token=`, password + confirm, calls `authApi.acceptInvite`, stores session, navigates to `/dashboard`), `frontend/src/pages/auth/VerifyEmailPage.tsx` (reads `?token=`, calls `GET /auth/verify-email/:token`, shows result + link to login), `frontend/src/components/common/RequirePermission.tsx` (`{ anyOf: string[]; children }` → renders children or `<Navigate to="/dashboard" replace />` after a `toast.error('You do not have access to that page')`)
- Modify: `frontend/src/router/index.tsx` (remove `/signup`, `/signup/success`; add `/accept-invite`, `/verify-email` under `AuthLayout`; wrap `/employees*`, `/departments`, `/designations`, `/payroll` (not `/payroll/my-payslips`), `/settings/*`, `/backups`, `/attendance/records`, `/attendance/settings|sites|geofences|qr-codes|allowed-ips`, `/leaves/requests|balances|types`, `/expense-claims/requests|categories|reports` in `RequirePermission` with the same `anyOf` the sidebar uses in `config/navigation.ts`), `frontend/src/lib/auth.api.ts` (remove `register`; add `acceptInvite(input: { token: string; password: string }): Promise<AuthSession>`, `verifyEmail(token: string): Promise<void>`), `frontend/src/lib/axios.ts` (on refresh failure: reject every pending request with the error, call `useAuthStore.getState().clear()` **before** redirecting — import the store lazily to avoid a cycle), `frontend/src/components/attendance/CheckInWidget.tsx:125-132` (delete both `alert()` calls), `frontend/src/components/ui/button.tsx` (add `asChild?: boolean`; when true and `children` is a single valid element, `cloneElement(child, { ref, className: cn(buttonVariants({variant,size}), className, child.props.className), ...props })` and never render `<button>`), the 10 files from audit 3.6 row 2 until `npm run type-check` is clean, `frontend/src/components/common/CookieConsent.tsx:104` + `frontend/src/pages/auth/LoginPage.tsx` (`/privacy` → `/privacy-policy.html`), `frontend/src/components/layout/NotificationDropdown.tsx` (remove the `/notifications` footer link), `frontend/src/components/common/OnboardingChecklist.tsx:73` (`/users` → `/employees/new`), `frontend/src/layouts/DashboardLayout.tsx:23` and `ShortcutHelp.tsx` (remove the `g c` → `/crm` shortcut), `frontend/src/components/common/CommandPalette.tsx` (delete the mock results block; filter nav items through `isItemEnabled`; skip entries without `to`), `frontend/src/components/ui/data-table.tsx` (new prop `error?: unknown` → renders "Couldn't load this list" + retry button instead of the empty state), `frontend/src/main.tsx` (remove `console.info`), `frontend/vite.config.ts` (`sourcemap: 'hidden'`), `frontend/package.json` (`"build": "tsc -b --noEmit && vite build"`), `frontend/src/config/navigation.ts` (Departments/Designations gate → `departments.view`/`designations.view`; Shifts → `shifts.view`; Holidays → `holidays.view`; Overtime → `overtime.view` for the management view, always visible for self-service)
- Test: `frontend/src/lib/axios.test.ts` (vitest + jsdom already configured), `frontend/src/components/ui/button.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// button.test.tsx — render(<Button asChild><a href="/x">Go</a></Button>); expect(screen.getByRole('link')).toHaveClass('inline-flex'); expect(container.querySelector('button')).toBeNull();
// axios.test.ts — mock the refresh endpoint to 401; trigger one 401 response; expect useAuthStore.getState().isAuthenticated === false and tokenStorage.getAccess() === null.
```

- [ ] **Step 2: Run to verify they fail** — `cd frontend && npx vitest run`.
- [ ] **Step 3: Implement everything in the Files list.**
- [ ] **Step 4: Verify** — `npm run type-check` → 0 errors; `npx vitest run` → PASS; `npm run build` → succeeds and `dist/assets` contains no `.map` files referenced from the JS (hidden maps are fine on disk; confirm the built JS has no `//# sourceMappingURL` line).
- [ ] **Step 5: Commit** — `git commit -m "fix(web): remove signup, add invite/verify pages, kill debug alerts, route guards, type-clean build"`

---

### Task 13: Rebuild dist, deploy checklist, phase commit

**Files:**
- Create: `docs/deploy-checklist.md`
- Modify: `backend/dist/**` (from `npm run build`), `frontend/dist/**` (from `npm run build`), `README.md` (deploy section points at the checklist)

- [ ] **Step 1: Build both** — `cd backend && npm run clean && npm run build`; `cd frontend && npm run clean && npm run build`. Expected: both exit 0.
- [ ] **Step 2: Smoke-run the built backend locally** against a scratch Mongo/Redis (as in the audit appendix): `node dist/index.js` → logs "API listening"; `curl localhost:4000/api/v1/health` → 200; `curl -X POST localhost:4000/api/v1/auth/register` → 404; `curl localhost:4000/uploads/x` → 404.
- [ ] **Step 3: Write `docs/deploy-checklist.md`** with these exact sections: (1) nginx — delete the `location /uploads/` block, add `location /uploads/ { return 404; }`, add `add_header Strict-Transport-Security "max-age=31536000" always; add_header X-Frame-Options DENY always; add_header X-Content-Type-Options nosniff always;` in the 443 server block; (2) `ufw default deny incoming && ufw allow 22,80,443/tcp && ufw enable`; (3) `.env` additions: `PUBLIC_BASE_URL=https://hrms.ddipl.org`, `HOST=127.0.0.1`, `SMTP_*`, `COMPANY_NAME`, `COMPANY_GSTIN`, `COMPANY_STATE_CODE`, `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`, `BACKUP_SCRATCH_MONGO_URI` (optional), `METRICS_TOKEN`; (4) `cd /var/www/hrms-new && git checkout -- backend/package-lock.json && git pull && cd backend && npm ci --omit=dev && npm run seed && pm2 restart all`; (5) `pm2 install pm2-logrotate && pm2 flush`; (6) move `backend/uploads/backups/*` out of the web root (they are no longer public once nginx stops serving `/uploads/`, but the old files carry raw tokens); (7) `apt install fail2ban && systemctl enable --now fail2ban`; (8) run `ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run seed:admin` only on a fresh install; (9) verify: `curl -I https://hrms.ddipl.org/uploads/backups/` → 404, `curl -s http://31.97.221.226:4000/` → connection refused.
- [ ] **Step 4: Bind the API to localhost by default in production** — `backend/src/config/env.ts` add `HOST: z.string().default('0.0.0.0')`; `index.ts` listens on `env.HOST`; the checklist sets `HOST=127.0.0.1`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "build: rebuild dist for phase 1; deploy checklist"`.
