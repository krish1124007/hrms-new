# DD HRMS — Production Readiness Audit

**Date:** 17 October 2026
**Scope:** backend API (Express + MongoDB), web app (React), mobile app (React Native, `dhrms-iosfinal/src`), and the production server `31.97.221.226` / `https://hrms.ddipl.org`.

**How this was done**

- Code review of every backend module, every web page, and every mobile screen (file + line references are given for each finding).
- The deployed build (`backend/dist` + `frontend/dist`, same commit `cdc2488` as production) was run locally against a fresh MongoDB/Redis, all 60+ web routes were opened in a browser, and the main flows were exercised end-to-end (register → create employee → login as employee → check-in/out → upload → payroll → backup).
- Read-only inspection of the production server (services, env, firewall, logs, nginx, data counts).

**Evidence tags used below**

- ✅ **Runtime-confirmed** — reproduced on the local copy of the deployed build, or observed directly on the production server.
- 📄 **Code-confirmed** — exact file:line was read; behaviour is certain from the code.
- ❓ **Suspected** — needs a device/runtime check.

**Severity**

- **P0 Blocker** — security hole, data exposure, or a feature that is fully broken; fix before the next deploy.
- **P1 High** — a major feature does not work correctly or is missing a key piece.
- **P2 Medium** — works but wrong/incomplete in common cases; will generate support tickets.
- **P3 Low** — minor, cosmetic, or hygiene.

---

## 1. Summary

The product is functionally very broad (attendance with 7 check-in methods, leave, payroll, expenses, loans, assets, documents, policies, notices, disciplinary, ID cards, field sales, projects, backups, audit logs) and most screens render and load real data. But it is **not safe to call production-ready today**:

| Area | P0 | P1 | P2 | P3 |
|---|---|---|---|---|
| Production server & deployment | 3 | 4 | 7 | 3 |
| Security, auth & access control | 6 | 8 | 6 | 4 |
| Employees, attendance, leave, shifts | 3 | 7 | 12 | 10 |
| Payroll, expenses, loans, assets, documents, policies | 2 | 10 | 16 | 10 |
| Projects & field sales (backend) | 6 | 8 | 8 | 5 |
| Web app (frontend) | – | 11 | 22 | 12 |
| API contract & permissions (web ↔ API ↔ mobile) | – | 4 | 3 | 1 |
| Mobile app | 3 | 11 | 14 | 9 |
| Code quality & process | 1 | 3 | 3 | 2 |

The five things that matter most, in order:

1. **Anyone on the internet can create a full Admin account** via the public `/signup` page / `POST /api/v1/auth/register` (every registration gets the `admin` role with `*` permissions). ✅
2. **Employee documents and full database backups are downloadable without login** from `https://hrms.ddipl.org/uploads/...` (I fetched a 640 KB production backup tarball with plain `curl`). Payslips, once generated, land at a predictable URL (`/uploads/payslips/2026-10/EMP000001.pdf`). ✅
3. **The backend is reachable directly on `http://31.97.221.226:4000`** (plain HTTP, no firewall), and **serving any uploaded file through Express crashes the process** (uncaught `ERR_HTTP_HEADERS_SENT`). ✅
4. **Rate limiting is switched off** (the 429 block is commented out), **access tokens are written to the pm2 logs** (~100,000 of them, 407 MB, no rotation), and the backup API lets any logged-in employee list/create/delete/restore backups — the restore path builds a shell command from user input. ✅📄
5. **Payroll and attendance logic is incomplete**: nobody is ever marked absent, approved unpaid leave is paid in full, re-processing a paid cycle wipes it, no pro-rata, salary structures are decorative, no TDS, and statutory reports show ESI/PT as 0. 📄
6. **The built-in HR roles cannot do HR work and employees see debug pop-ups.** Of 353 authenticated API routes, the seeded HR Manager can reach 131, Manager 98, Employee 111 — HR Managers get 403 on Departments, Designations, Shifts, Holidays, Overtime, and cannot check in, apply leave or file expenses themselves; only the `admin` (`*`) role works. And the live check-in widget contains leftover `alert('DEBUG ERROR CAUGHT: …')` pop-ups that fire on every failed check-in. ✅📄

Production data corroborates several of these: 98 employees but only 39 user accounts (bulk-imported employees cannot log in), 0 `pushdevices` (push notifications never wired), 1,813 expense claims against 2,264 attendance rows (every check-out is gated on filing an expense), 0 visits/orders/payments (the field module is unused), 9,994 audit-log rows (filled by 4xx noise), 371 session rows holding raw tokens.

**What works well:** JWT issuance/rotation, session revocation on password change, password strength + breach check, Helmet/CORS/CSRF basics, IST day-boundary handling in attendance, overlap/working-day maths in leave, loan EMI schedule, asset assign/return history, document path-traversal guard, policy versioning, ID-card HMAC QR, the backup *concept*, idempotent role seed, soft-delete plugin, pagination clamp, Mongo-operator sanitisation. All 60+ web routes render with sensible empty states; no 500s were seen during the browser sweep.

---

## 2. Fix-first list (P0 blockers)

| # | Finding | Evidence | Fix |
|---|---|---|---|
| 1 | Public signup creates a super-admin. Second and third registrations also got `admin` / `['*']`. (In production the web form happens to fail — it omits the `acceptTerms`/`acceptPrivacy` flags and gets `400 CONSENT_REQUIRED` — but a direct `POST` with the two flags succeeds, which is what an attacker would do.) | ✅ `backend/src/controllers/auth.controller.ts:59-66,77-95` (`roles.get('admin')`, `role: adminRoleId, status:'active'`), route `routes/auth.routes.ts:16`, page `frontend/src/router/index.tsx:155` (`/signup`), `frontend/src/lib/auth.api.ts:31-39`. No first-user guard, no toggle. | Remove `/register` + `/signup` entirely (admins create users), or make it create an `employee`/`invited` user that requires approval. **Immediately** block it in nginx until the code ships. Then audit the `users` collection for unknown admins. |
| 2 | All files under `/uploads/` are public: employee documents (117 in prod, incl. WhatsApp images), DB backups (`/uploads/backups/<date>-<id>.tar.gz` → **200**, 640 KB), and payslips at a guessable path. | ✅ nginx `location /uploads/ { alias …/backend/uploads/ }`; `backend/src/index.ts:98` `express.static`; payslip key `services/payslip-pdf.service.ts:611` = `payslips/YYYY-MM/<employeeCode>.pdf`; backups written under the upload root `jobs/backup.jobs.ts:74,99`. | Move uploads outside the web root; serve through an authenticated download route that checks ownership/permission; random, non-derivable file keys; backups never under `UPLOAD_DIR`. **Immediately**: `deny all` for `/uploads/backups/` and `/uploads/payslips/` in nginx and move existing backup files out. |
| 3 | Backend listens on `*:4000` and the server has no firewall (`ufw inactive`). `http://31.97.221.226:4000/api/v1/...` answers from the internet over plain HTTP, bypassing TLS and nginx. | ✅ `ss -ltnp` on server; external `curl` returned API JSON. | Bind the API to `127.0.0.1` (`HOST=127.0.0.1` in `index.ts` `app.listen`) **and** enable `ufw` allowing only 22/80/443. |
| 4 | Serving any static file through Express kills the API (`Cannot set headers after they are sent` → `uncaughtException` → `process.exit`). Reproduced twice. | ✅ `backend/src/middleware/compression-telemetry.middleware.ts:31-38` calls `res.setHeader` inside the wrapped `res.end` after the stream already flushed headers; mounted globally at `index.ts:95` before `express.static` at `:98`. `index.ts:233-236` exits on uncaught exceptions. | Guard with `if (!res.headersSent)` or delete the telemetry middleware. Any streamed response (file download, PDF) is affected. |
| 5 | Backup API has no permission check; a normal employee listed backups (200). Restore interpolates a user-supplied Mongo URI into `execSync("mongorestore --uri=\"…\" --drop …")` → command injection + restore-to-attacker-host. The "not production" guard is a substring check. | ✅📄 `routes/backup.routes.ts:8-23` (only `authMiddleware`); `controllers/backup.controller.ts:23` (`z.string().url()`), `:104-113`; `jobs/backup.jobs.ts:151-154`. | `requirePermission('backups.manage')` on every backup route; remove remote-URI restore (or allow-list a fixed scratch URI from env) and use `execFile` with an argv array. |
| 6 | Rate limiting is disabled — the whole 429 branch is commented out, so `/login`, `/forgot-password`, `/reset-password`, `/register` are unlimited. Per-email lockout *does* fire after 5 failures, which lets an attacker lock any admin out indefinitely. | ✅ `backend/src/middleware/rate-limit.middleware.ts:31-44` (same in `dist`); 40 bad logins → no 429, then "Account locked … 15 minutes". | Uncomment the block; add IP-based limiting; progressive delay instead of a hard lock; don't track unknown emails. |
| 7 | Bearer tokens and cookies logged on every request: 99,988 `"authorization":"Bearer …"` lines in `/root/.pm2/logs/backend-out.log`; logs are 407 MB with no rotation. | ✅ server log grep; `backend/src/index.ts:109-123` uses `pino-http` default serializers; `config/logger.ts` has no `redact`. | `redact: ['req.headers.authorization','req.headers.cookie']`; install `pm2-logrotate`; purge the existing logs (they contain valid 15-minute tokens and 30-day refresh cookies). |
| 8 | Payroll integrity: re-processing a `processed`/`paid` cycle hard-deletes all records (manual edits, loan deductions, payslip URLs lost); `markCyclePaid` has no state check; a locked record can be edited via another cycle's URL. | 📄 `controllers/payroll.controller.ts:509-515` (`deleteMany`), `:740-748`, `:589-595` (no `cycleId` match). | State machine `draft → processed → locked → paid`; locked/paid terminal; `findOne({_id: recordId, cycleId})`. |
| 9 | Nobody is ever marked absent and leave never touches attendance, so **employees who never check in are paid in full** and **approved unpaid leave (LWP) is paid**. `autoCheckoutTime` is defined but never used; `getLeaveDeductionsForPayroll` exists with zero callers. | 📄 `backend/src/jobs/` has only `backup.jobs.ts`; `payroll.controller.ts:378-391` (LOP = `absent` rows only); `leaves.controller.ts:526-548` (approve only `$inc`s `used`); `services/integration.service.ts:195` unused. | Nightly job (BullMQ is already there) that stamps `absent` for working days with no row and closes open check-ins; on leave approval write `on_leave`/`absent` rows per day (reverse on cancel); have payroll consult `LeaveRequest` for paid vs unpaid. |
| 10 | Email is not configured on the server (`SMTP_PASS` empty, `SMTP_FROM=hr@yourdomain.com`, `COMPANY_NAME="Your Company Name"`), and the code reports "sent" anyway. So forgot-password, invites, and welcome mails silently go nowhere, and payslips/ID cards print "Your Company Name". | ✅ server `.env`; `services/email.service.ts:90-96` returns `true` without a transport; `auth.controller.ts:324-330` always answers success. | Fill `SMTP_*`, `COMPANY_*`, `COMPANY_GSTIN` (code default is the fake `27AAAAA0000A1Z5`); refuse to boot in production without a mail transport; alert when `sendMail` fails. |
| 11 | Even with email working, the links are broken: invite/activation mails point to `/accept-invite/<token>` which exists in **neither** backend nor frontend; password-reset mails point to `/reset-password/<token>` but the page is `/reset-password?token=` → **404** (observed). Invited users (`status:'invited'`) can never activate; login rejects them. | ✅📄 `users.controller.ts:89`, `employees.controller.ts:253`, `auth.controller.ts:327`; `frontend/src/router/index.tsx:158`; `pages/auth/ResetPasswordPage.tsx:35-36`. | Add `POST /auth/accept-invite {token,password}` + page; send `/reset-password?token=…`; add `/verify-email/:token` page. |
| 12 | The TypeScript source is not in git (`.gitignore` excludes `**/src/`, `**/*.ts`); only compiled `dist/` is committed and the server does `git pull && pm2 restart`. The only copy of the editable source is this Mac. | ✅ `.gitignore:4-9`; 630 tracked `backend/dist` files. | Track `src/`; build in CI or on the server; stop committing `dist/`. |

---

## 3. Full findings by area

### 3.1 Production server & deployment

| Sev | Finding | Evidence |
|---|---|---|
| P0 | API on `*:4000` reachable from the internet; `ufw` inactive. | ✅ (see #3 above) |
| P0 | `/uploads/` served publicly by nginx; backups + documents downloadable. | ✅ (see #2) |
| P0 | Tokens in pm2 logs; 407 MB logs, no `pm2-logrotate`. | ✅ (see #7) |
| P1 | Meilisearch is not running (`meilisearch=inactive`, `MEILISEARCH_HOST` not set) and the code swallows errors and returns `[]` → global search silently returns nothing; every employee save also logs a Meili failure. | ✅ server; `services/search.service.ts:70-85` |
| P1 | SMTP incomplete / placeholder company values (see #10). | ✅ |
| P1 | SSH: `PermitRootLogin yes`, `PasswordAuthentication yes`, `fail2ban` inactive, 63 pending apt updates. | ✅ `sshd -T`, `systemctl` |
| P1 | Redis outage hangs the whole API instead of degrading: `maxRetriesPerRequest: null` + `await redis.ping()` at boot; the auth middleware awaits Redis on every request. The server error log has 948 `ECONNREFUSED 127.0.0.1:6379` entries (last on 15 Oct). | ✅ server log; 📄 `config/redis.ts:6`, `index.ts:38`, `middleware/auth.middleware.ts:40-43` |
| P2 | MongoDB runs without authentication (81 collections readable with a bare `mongosh`). Bound to localhost, so only a hardening gap today. | ✅ `mongod.conf`, `mongosh` |
| P2 | MongoDB is standalone, not a replica set → the app logs "Transactions unsupported … running without atomicity"; every `withTransaction` silently runs non-atomically. | ✅ local log; prod uses the same standalone URI |
| P2 | No off-site backup; backups are monthly only (`23:50` last day), stored on the same disk, no retention, deletion leaves the public file on disk, failure only logged. | 📄 `backup.jobs.ts`, `backup.controller.ts:140-148` |
| P2 | The monthly schedule is force-re-enabled on every boot regardless of the admin toggle. | 📄 `index.ts:185` |
| P2 | nginx sends no security headers (no HSTS, X-Frame-Options, CSP) for the SPA — Helmet only covers `/api/v1`. | ✅ `curl -I` |
| P2 | Backup worker runs inside the API process using `execSync` + `readFileSync` of the whole tarball → every request freezes during a backup. | 📄 `index.ts:178`, `backup.jobs.ts:79-99` |
| P2 | `backend/package-lock.json` is locally modified on the server; a future `git pull` touching it will fail. | ✅ `git status` on server |
| P3 | Health endpoint mismatch: mounted at `/api/health`, nginx only proxies `/api/v1/*` → `/api/v1/health` is 404; pino's ignore-list uses the wrong path. | ✅ `index.ts:119,128` |
| P3 | Swagger UI + `/api/docs.json` + `/api/metrics` are mounted without auth or env gate (only unreachable today because nginx proxies just `/api/v1/`; reachable via port 4000). | 📄 `index.ts:128-148`, `routes/health.routes.ts:66-69` |
| P3 | `UPLOAD_DIR=./uploads` is CWD-relative; depends on pm2's cwd. | 📄 `config/env.ts:22` |

### 3.2 Security, authentication & access control (backend)

| Sev | Finding | Evidence |
|---|---|---|
| P0 | Public registration → admin (see #1). | ✅ |
| P0 | Backup API ungated + command injection in restore (see #5). | ✅📄 |
| P0 | Rate limiting off; lockout usable as DoS (see #6). | ✅📄 |
| P0 | Static-file crash (see #4). | ✅ |
| P0 | Stored XSS on the app origin: document upload has no type allow-list; an uploaded `.html` was served back with `Content-Type: text/html` from `/uploads/...` (same origin as the SPA, tokens in `localStorage`). | ✅ `routes/document.routes.ts:12-19`, `controllers/document.controller.ts:145-149`; `frontend/src/lib/axios.ts:5-13` |
| P0 | Any employee can create/edit/delete company notices (a test employee posted "Office closed tomorrow", 201) — which also pushes a notification to every employee. | ✅ `routes/notice.routes.ts:11-16` (no `requirePermission`), `notice.controller.ts:109-118` |
| P1 | `GET /users` and `GET /users/:id` (and `/auth/me`) return `passwordResetToken`, `passwordResetExpires`, `emailVerificationToken` → anyone with `users.view` can take over any account via forgot-password + reset. | 📄 `users.controller.ts:55-61,97-101`; `models/user.model.ts:90-92` (no `select:false`) |
| P1 | Privilege escalation: `users.update` accepts any `roleId` (incl. admin) and any `customPermissions` (incl. `*`); `roles.create/update` accept arbitrary permission strings. | 📄 `users.controller.ts:22-24,110-111`; `roles.controller.ts:12,43` |
| P1 | Seeded roles lack the permissions the self-service routes require (`attendance.checkin`, `leaves.create`, `expenses.*`) for HR Manager / HR Executive / Manager → HR staff cannot check in, apply leave, or file expenses. The permission catalogue is missing 22 permissions that routes actually check (and lists `expense-claims.*` which nothing uses), so custom roles can't be granted them. | 📄 `models/role.model.ts:47-86`; `routes/attendance.routes.ts:24`, `leaves.routes.ts:20,83`, `expense-claims.routes.ts:14-59`; `roles.controller.ts:87-111` |
| P1 | Expense claims are fully IDOR-able: employee role has `expenses.view/update/delete`; list/get/update/delete have no ownership check; `createClaim` accepts `employeeId` from the body; approvers can approve their own claims; approved/reimbursed claims are deletable. | 📄 `role.model.ts:109-112`; `expense-claims.controller.ts:137-163,207-208,244-302` |
| P1 | Leave: anyone with `leaves.create` (every employee) can apply **for any employee**; approvers can approve their own requests; no manager-chain check. | 📄 `leaves.controller.ts:293,414-415,526`; `routes/leaves.routes.ts:88-92` |
| P1 | Location routes have no permission gates (any employee can create/delete offices and reassign employees). | 📄 `routes/location.routes.ts:10-15` |
| P1 | Policy acknowledgements are forgeable (`employee` taken from the body, only `policies.view` required). | 📄 `hr-policies.controller.ts:75-78,348-367` |
| P1 | Real-time channel dead at both ends: default socket namespace has no auth and nobody joins `user:<id>` rooms; `socket.io-client` is listed in `frontend/package.json` but never imported; mobile has none. | 📄 `index.ts:163-167`, `sockets/field-tracking.socket.ts:18-19`; `frontend/src/hooks/use-notifications.ts:61` |
| P2 | Session rows store raw access + refresh JWTs (371 in prod) → any DB read (or a public backup) = 30-day session hijack. | 📄 `models/session.model.ts:19-20` |
| P2 | Every 4xx writes an audit-log row with the raw URL, no TTL (9,994 rows in prod; my admin produced 5 "failure" rows just by opening "My Attendance"). | ✅ `middleware/error.middleware.ts:141-154` |
| P2 | `/attendance/monthly?employeeId=` and overtime `/:id` routes have no object-level auth → any employee can read a colleague's month / edit others' OT requests. | 📄 `routes/attendance.routes.ts:64-68`; `routes/overtime.routes.ts:21-24`, `overtime.controller.ts:140-203` |
| P2 | Salary and **decrypted** bank/PAN are returned to every `employees.view` holder (Manager role included). | 📄 `employees.controller.ts:152-161,268-276`; `employee.model.ts:158-162` |
| P2 | Unescaped user input in `$regex` (ReDoS/regex injection) in users, assets, policies, disciplinary, loans, attendance search and in the import parsers. | 📄 `users.controller.ts:48-53`, `assets.controller.ts:110,380-437`, `attendance.controller.ts:720`, … |
| P2 | Password-reset "sent" even with no mail transport (see #10). | 📄 |
| P3 | 2FA not implemented (`otplib` dependency, zero usages; `twofactors` collection empty). | 📄 `package.json:51` |
| P3 | `logout` route is mounted without `authMiddleware` → never audited; `logout` from mobile sends no `refreshToken` → session not revoked. | 📄 `routes/auth.routes.ts:19`, `auth.controller.ts:260-291` |
| P3 | Dead alternate `app.ts` with `cors({origin:'*', credentials:true})` and `console.log(req.body)` (not mounted). | 📄 `app.ts:21,36-38` |
| P3 | Public ID-card verify returns name/photo/designation/DOJ even for invalid/ex-employees; HMAC keyed on `JWT_SECRET` (rotating it voids all printed cards). | 📄 `id-card.controller.ts:146-190`, `lib/id-card-token.ts:19-24` |

### 3.3 Employees, attendance, leave, shifts, overtime

| Sev | Finding | Evidence |
|---|---|---|
| P0 | No absent-marking / auto-checkout job (see #9). | 📄 |
| P0 | Approved leave never affects attendance or payroll (see #9). | 📄 |
| P0 | Geofence/site/QR/IP enforcement is bypassable: the **client** chooses the method and `manual` validates nothing (location requirement commented out). A test employee checked in with `{"method":"manual"}` and no location. Mobile hard-codes `manual` for check-out, so admins cannot disable it. | ✅ `attendance.controller.ts:217-220,318-328`; `dhrms-iosfinal/src/screens/attendance/AttendanceScreen.tsx:149`; `frontend/src/components/attendance/CheckInWidget.tsx:81,187` |
| P1 | Face check-in is client-trusted: server only checks `faceConfidence >= 0.85` sent by the client; mobile sends a placeholder string. Not a real feature. | 📄 `attendance.controller.ts:224-233`; `FaceAttendanceScreen.tsx:19` |
| P1 | Allowed-IP check reads the client-controlled first `X-Forwarded-For` entry. | 📄 `attendance.controller.ts:254-258` |
| P1 | Night shifts cannot check out (check-out only looks up *today's* record; `isNightShift` unused). | 📄 `attendance.controller.ts:376-379,486-488` |
| P1 | Every check-out is hard-gated on filing an expense claim that day (`EXPENSE_REQUIRED_FOR_CHECKOUT`) for **all** employees, office staff included. Combined with no auto-checkout, forgotten check-outs stay open with 0 hours forever. Prod data: 1,813 expense claims vs 2,264 attendance rows. | ✅ `attendance.controller.ts:502-522` |
| P1 | Bulk-imported employees never get a user account (no `User` created, no invite). Prod: 98 employees, 39 users. | ✅📄 `employees.controller.ts:432,478` |
| P1 | Leave: no accrual, carry-forward, pro-rata for mid-year joiners, or year rollover (balances vanish on 1 Jan; `carryForward` config never read). | 📄 `leaves.controller.ts:280,473-490` |
| P1 | Leave balance can go negative: pending requests are not counted on apply, and approve `$inc`s without re-checking. | 📄 `leaves.controller.ts:487-496,535-544` |
| P1 | Leave-type rules (`applicableGender`, `probationAllowed`, `halfDayAllowed`, `attachmentRequired`, `isActive`) are stored but never enforced. | 📄 `models/leave-type.model.ts:18-23` |
| P2 | Regularization captures no requested times; approval sets `present` with 0 hours; re-filing overwrites a decision; future dates allowed; nobody notified. | 📄 `attendance.controller.ts:883-924` |
| P2 | No notification or email on leave/overtime apply, approve or reject — `notifyLeaveRequest` & co. have **zero callers** anywhere; only notice publishing creates notifications. | ✅ grep; `services/notification.service.ts:61-178` |
| P2 | Shift timing fields (`graceMinutes`, `endTime`, `halfDayHours`, `fullDayHours`, `breakDuration`, `isDefault`) are never read; late/half-day use global config; `earlyLeaveBy` never computed; employees without a shift are never marked late. | 📄 `shift.model.ts:11-19`; `attendance.controller.ts:357,374,542` |
| P2 | Shift-swap endpoint fakes success (writes an audit row, returns 202, persists nothing). | 📄 `shifts.controller.ts:274-295` |
| P2 | Dashboards disagree: team view shows people on approved leave as "not checked in"; `absentToday` is always 0; 7-day trend compares `'half-day'` against enum `half_day`; attendance-rate denominators count only rows that exist (rate ≈ 100%). | 📄 `team.controller.ts:131-176`; `dashboard.service.ts:121-147`; `dashboard.controller.ts:124,278-311` |
| P2 | Holidays: department-specific / optional / restricted holidays are treated as company-wide; `isRecurring` never generates next year; import has no dedupe. | 📄 `leaves.controller.ts:45-51`; `holidays.controller.ts:101-105` |
| P2 | Employee exit is immediate even with a future `exitDate`; nothing flips status on the date; future approved leaves not cancelled; assets/loans not reconciled. | 📄 `employees.controller.ts:307-333` |
| P2 | Soft-deleted employees cannot be restored (create/import say "restore instead", no restore route). | 📄 `employees.controller.ts:192,222-224,470` |
| P2 | `PATCH /employees/:id` uses `findByIdAndUpdate` → skips the `grossSalary` pre-save hook, doesn't sync `User.email`, allows self/cyclic `reportingManager`, and a partial `salary` body replaces the whole sub-document. | 📄 `employees.controller.ts:281`; `employee.model.ts:277-295` |
| P2 | Excel import silently overwrites existing employees by email, auto-creates departments/designations from any free-text cell, and drops the Employee ID column. | 📄 `employees.controller.ts:451-476` |
| P2 | Cancelling an already-taken approved leave restores the balance (no date check). | 📄 `leaves.controller.ts:567-600` |
| P2 | Static QR is replayable from anywhere (no location check); `device` method accepts any `deviceId`. | 📄 `attendance.controller.ts:234-242,313-317` |
| P2 | `/attendance/report` returns every row in range with populate, no limit. | 📄 `attendance.controller.ts:1139-1142` |
| P3 | Employee-code generation races and sorts as strings (`EMP9999` < `EMP10000`); same for asset/loan/policy/case numbers. | 📄 `employee.model.ts:251-274` |
| P3 | `resetLeaveBalances` also zeroes `allocated`. | 📄 `leaves.controller.ts:279-281` |
| P3 | Leave spanning Dec→Jan deducts entirely from the start year. | 📄 `leaves.controller.ts:456,534` |
| P3 | Users without an Employee record see the whole company in team/roster views; `teamRoster` is unbounded. | 📄 `team.controller.ts:72-74`; `shifts.controller.ts:254-264` |
| P3 | Time entries can be logged as any user; weekly timesheet buckets by UTC date. | 📄 `time-entries.controller.ts:47,146` |
| P3 | Department parent cycles allowed. | 📄 `departments.controller.ts:102-110` |
| P3 | Dynamic-QR rotation needs `attendance.config` → lobby display must run as admin. | 📄 `routes/attendance.routes.ts:163-167` |
| P3 | Server-timezone dependency in month ranges (`TZ` not pinned). | ❓ `attendance.controller.ts:626-631,833-856` |
| P3 | Admin users without an employee profile get silent 403/404s on "My Attendance", "My Leaves", "Timesheet", "My ID card" — the pages show "Not checked in" / "No balances" instead of explaining. | ✅ browser sweep |

### 3.4 Payroll, expenses, loans, assets, documents, policies, notices, disciplinary, ID cards

| Sev | Finding | Evidence |
|---|---|---|
| P0 | Re-process wipes processed/paid cycles; no state machine; lock bypass via other cycle's URL (see #8). | 📄 |
| P0 | Payslips/documents/backups public (see #2). | ✅ |
| P1 | Salary structures/components are decorative: payroll reads `employee.salary.basic/hra/da/specialAllowance` directly; `assignStructure` only writes an audit row ("For now we just record an audit"). | 📄 `payroll.controller.ts:268-279,397-400` |
| P1 | No pro-rata for joiners/leavers; resigned/terminated employees are excluded from the cycle entirely (no final settlement). | 📄 `payroll.controller.ts:391,517` |
| P1 | LOP ignores approved unpaid leave; `paidLeaveBalance` hard-coded 0. | 📄 `payroll.controller.ts:382,497` |
| P1 | Loans and approved expense reimbursements are **not** pulled into payroll (manual entry only); `integration.service.ts` loan stub returns zeros and is imported nowhere. | 📄 `payroll.controller.ts:435-456,577-583`; `integration.service.ts:250-275` |
| P1 | No TDS computation at all (`tax.service.ts` is a GST engine). | 📄 `payroll.controller.ts:116` |
| P1 | Statutory report always shows ESI = 0 and PT = 0 (matches on display names `'ESIC'`/`'Professional'` but lines are named `'ESI Employee'`/`'P.Tax'`). | 📄 `payroll.controller.ts:451-474,916-922` |
| P1 | Asset Excel import creates phantom employees/users (`firstName:'Employee', lastName:'User'`) for any unknown email and writes asset fields onto Employee/User docs. | 📄 `assets.controller.ts:379-431`; `employee.model.ts:229-232` |
| P1 | Stored XSS via document upload (see 3.2). | ✅ |
| P1 | Expense IDOR (see 3.2). | 📄 |
| P1 | Policy acknowledgement forgeable (see 3.2). | 📄 |
| P2 | PF on full-month basic (ignores LOP and DA) → an employee with 0 paid days still gets ₹1,800 deducted (negative net). | 📄 `payroll.controller.ts:39-41,446` |
| P2 | ESI eligibility decided on prorated gross, not the wage ceiling / contribution period; employee share not rounded up. | 📄 `payroll.controller.ts:55-63,447` |
| P2 | Professional Tax hard-coded to Maharashtra slabs (no Feb ₹300, no exemptions, no other states). | 📄 `payroll.controller.ts:31-35` |
| P2 | Cycle totals go stale after record edits; yearly report sums stale totals. | 📄 `payroll.controller.ts:630-638,874-890` |
| P2 | Employees see unreviewed draft payroll in "My Payslips" and can download a PDF of it. | 📄 `payroll.controller.ts:957-962` |
| P2 | Payslip totals don't match the listed lines (arrears/reimbursements/loan deduction added to totals but never printed as lines); YTD computed but unused. | 📄 `payroll.controller.ts:630-638`; `payslip-pdf.service.ts:397-418` |
| P2 | Privilege checks hard-code role slugs (`admin`/`hr_manager`) → a custom Finance role with `payroll.process` is 403'd on record/payslip endpoints. | 📄 `payroll.controller.ts:789-795`; `document.controller.ts:16` |
| P2 | No bulk payslip download or email. | 📄 `payroll.controller.ts:672-720` |
| P2 | No effective-dated salary history (re-processing an old cycle after a raise uses new figures); employee audit logs raw bank/PAN in `after`. | 📄 `employees.controller.ts:280-292` |
| P2 | Default roles have none of the newer permissions (`expenses.approve`, `loans.*`, `assets.*`, `policies.manage`, `disciplinary.*`, `notices.*`, `backups.*`) → only Admin can use those modules. | 📄 `role.model.ts:44-128` |
| P2 | Employees cannot acknowledge their own disciplinary action (route needs `disciplinary.view`); HR comments are returned to the employee. | 📄 `routes/disciplinary.routes.ts:44-49`; `disciplinary.controller.ts:40-44,225-292` |
| P2 | Editing a published policy immediately un-publishes it; employees can read drafts/archived policies and the full acknowledgement roster. | 📄 `hr-policies.controller.ts:207-239` |
| P2 | Notice department targeting is write-only (never filtered on read); `acknowledged` is never computed per user. | 📄 `notice.controller.ts:54-69,124-131` |
| P2 | Document access levels incomplete (`department` sharing never evaluated); `expiryDate`/versions/`downloadCount` exist in the model but nothing sets them; no expiry reminders. | 📄 `document.controller.ts:29-39`; `document.model.ts:71-75` |
| P2 | Search silently empty without Meilisearch; only employees are indexed; `customers/leads/deals/products/tickets` are SaaS leftovers. | 📄 `search.service.ts:5-13,70-85` |
| P2 | Backup types `files`/`full` only run `mongodump`; uploads are never backed up. | 📄 `backup.jobs.ts:79` |
| P2 | "Compliance" = self-serve account deletion that leaves the Employee active in payroll. | 📄 `compliance.controller.ts:15-56` |
| P2 | Expense reports sum `amount` not `acceptedAmount`, calendar year not FY; category limit only on create. | 📄 `expense-claims.controller.ts:218-220,260,346-367` |
| P3 | ID-card template endpoint always fails (schema/model mismatch) and templates are unused. | 📄 `id-card.controller.ts:13-21`; `id-card-template.model.ts:24-30` |
| P3 | Unbounded lists: cycle records, statutory report (no filter = every record ever), my-payslips, structures, my-loans, my-assets, published policies. | 📄 |
| P3 | Payroll processing is non-atomic / non-idempotent; payslip generation is a sequential N+1. | 📄 `payroll.controller.ts:523-539,687-714` |
| P3 | Loans: no employee self-apply, `disbursed`/`cancelled`/`overdue` statuses never set, `startMonth` on the 31st skews due dates. | 📄 `loans.controller.ts:135-136,391` |
| P3 | Attachments on disciplinary/notices are arbitrary URLs; policy PDF check trusts client MIME. | 📄 |
| P3 | Audit gaps: payslip generation, policy restore, disciplinary comments, notice acknowledge write no audit; `audit()` failures are swallowed. | 📄 `audit.service.ts:30-32` |
| P3 | Dev Mongo dump + connection string are still in git history (`data-export/`); deleted in the working tree this session but present in past commits. | ✅ |
| P3 | Outdated deps with known CVEs: `multer 1.4.5-lts` (DoS), `xlsx 0.18.5` (prototype pollution/ReDoS). | ❓ `backend/package.json:46,60` |

### 3.5 Projects & field sales (backend)

Module status: field clients/visits/orders/payments/targets/tasks/tracking are **complete on the web**, but the mobile contracts are broken (next section) and there is **no Product model** (orders have no catalogue, pricing, GST or stock). Projects/tasks/milestones/time-entries are **complete in the backend but unreachable in the web app** (no routes). Socket.io live tracking, `Channel`/`Message` models and `integration.service.ts` are **dead code**.

| Sev | Finding | Evidence |
|---|---|---|
| P0 | Field routes have no ownership checks and "view" grants write: any rep can read/edit colleagues' visits, orders, cash collections, reassign tasks, download anyone's GPS trail, and attribute sales to anyone (`employeeId` taken from the body). | 📄 `routes/field.routes.ts:76-335`; `field-visits.controller.ts:24,127-214`; `field-orders.controller.ts:21`; `field-payments.controller.ts:13`; `field-tracking.controller.ts:121-144` |
| P0 | Receipt/order numbering breaks after a soft-delete (next number computed from non-deleted docs while the unique index still holds the deleted one → every new payment 409 until manual DB repair); also races. | 📄 `field-payments.controller.ts:44-55`; `payment-collection.model.ts:57`; `field-orders.controller.ts:64-78` |
| P0 | Client receivables ledger drifts: `outstandingAmount/totalPayments/totalOrders` only ever `$inc` on create; edits, cancels and deletes never reverse; nothing transactional. | 📄 `field-orders.controller.ts:144-184`; `field-payments.controller.ts:120-159` |
| P0 | Leaderboard/targets always show 0 achieved for amount/quantity targets (populated doc passed where an ObjectId is expected → aggregate never matches; `status:'behind'` persisted). | 📄 `field-targets.controller.ts:52-119,173-188` |
| P1 | Duplicate payment submission unprotected (`idempotent()` middleware exists but is applied to no route). | 📄 `middleware/idempotency.middleware.ts:25` |
| P1 | Project write permissions (`projects.create/update/delete`) are required by routes but don't exist in the catalogue → only `*` admins can touch projects. | 📄 `routes/projects.routes.ts:23-82`; `roles.controller.ts:107` |
| P1 | Timesheet submit/approve doesn't exist (model has no status; routes read-only); anyone with `projects.update` can log hours for any user. | 📄 `models/time-entry.model.ts`; `routes/timesheets.routes.ts:9-10` |
| P1 | Visit check-in GPS fully trusted (never compared with the client's location); photo upload route `/field/uploads/photo` doesn't exist → selfies silently vanish. | 📄 `field-visits.controller.ts:165-191`; `dhrms-iosfinal/src/api/visit.api.ts:211` |
| P1 | Realtime tracking is dead: `const tenantId = undefined; if (ns && tenantId)` never emits; no client anywhere. | 📄 `field-tracking.controller.ts:66-68` |
| P2 | Server-local-midnight timezone bug across all field reports/dashboards/targets ("today" is wrong between 00:00 and 05:30 IST) — the attendance module already fixed this pattern with `lib/business-day.ts`. | 📄 `field-visits.controller.ts:113-117,218-222`; `field-payments.controller.ts:175-179`; `field-dashboard.controller.ts:8-11`; `field-targets.controller.ts:48-49` |
| P2 | Visit lifecycle unguarded (multiple open visits, re-checkout overwrites, negative duration, `completed` without check-in). | 📄 `field-visits.controller.ts:31-33,200-212` |
| P2 | Order money fields trusted from the client; any status transition allowed; reps can self-confirm to hit targets. | 📄 `field-orders.controller.ts:24-26,133-184` |
| P2 | Payments: no overpayment check, `orderId` not validated against `clientId`, no deposit/reconciliation endpoint, no audit on money mutations. | 📄 `field-payments.controller.ts:126-170` |
| P2 | Field tasks: no notifications; completion notes dropped (mobile sends `notes`, server expects `completionNotes`). | 📄 `field-tasks.controller.ts:30-33,122-130` |
| P2 | Two tracking ingest paths; `/field/tracking/batch` bypasses the consent/clocked-in gate the attendance copy enforces. | 📄 `field-tracking.controller.ts:39-63` vs `attendance.controller.ts:1176-1186` |
| P2 | `Project.client` refs an unregistered `Customer` model → once any project has a client, `GET /projects` 500s. | 📄 `models/project.model.ts:53` |
| P2 | Unbounded/injectable queries in clients map, team tasks, my-orders/payments/tasks, outstanding report. | 📄 `field-clients.controller.ts:76-114` |
| P3 | Kanban/task validation gaps (invalid ids → 500; reorder not scoped). | 📄 `tasks.controller.ts:73-128` |
| P3 | LocationTrack TTL keyed on client-supplied timestamp. | 📄 `field-tracking.controller.ts:46` |
| P3 | Dead code: `Channel`/`Message` models, `integration.service.ts`, swagger paths for `/inventory/products`, `/customers`, `/warehouses`. | 📄 |
| P3 | Socket auth never checks user status. | 📄 `sockets/auth.middleware.ts:20-60` |

### 3.6 Web app (frontend)

Runtime sweep: all 60+ routes render; no 500s; empty states are sensible; no `ComingSoonPage` is routed (the only literal "coming soon" is Employees → Export). All frontend API paths/methods match a backend route and response envelopes are read consistently. Findings (paths relative to `frontend/src`):

| Sev | Finding | Evidence |
|---|---|---|
| P1 | **Leftover debug `alert()`s in the live check-in widget**: every failed check-in/out on My Attendance (e.g. the common "location required" path) pops `alert('DEBUG ERROR CAUGHT: ' + JSON…)` and `alert('DEBUG: Intercepted LOCATION_REQUIRED backend error! Showing popup now.')`. Present in the built bundle on production. | ✅ `components/attendance/CheckInWidget.tsx:125-132`; `frontend/dist/assets/EmployeeAttendancePage-*.js` |
| P1 | `npm run type-check` fails with **29 TypeScript errors** (`vite build` ignores them, so broken types ship): `asChild` passed to a `Button` that doesn't support it (6 pages → React console errors, nested interactive elements), `<div>` inside `<p>` in `StatCard` (DOM-nesting error on the dashboard), missing return paths. | ✅ `pages/assets/AssetDetailPage.tsx:151`, `DisciplinaryDetailPage.tsx:235`, `DisciplinaryListPage.tsx:177`, `PolicyDetailPage.tsx:198`, `SignupSuccessPage.tsx:109`, `DashboardPage.tsx:112-128`, `components/common/OfflineIndicator.tsx:35`, `OnboardingChecklist.tsx:103` |
| P1 | Public `/signup` page exists (see #1). | ✅ |
| P1 | Email links land on 404s: `/reset-password/<token>` → 404 (page expects `?token=`); `/accept-invite/<token>` has no page; `/verify-email/:token` has no page. | ✅ |
| P1 | **Built-in HR roles cannot use the HR navigation.** Nav gates and route permissions disagree: Departments/Designations/Shifts are shown on `employees.create/update/delete` but need `departments.view`/`designations.view`/`shifts.view`; Holidays and Overtime are ungated but need `holidays.view`/`overtime.view`; HR Manager / HR Executive / Manager also lack `attendance.checkin`, `leaves.create`, `expenses.*`, so "My Attendance / My Leaves / My Expenses" 403 for them, and Manager/HR Executive lack `payroll.view` for "My Payslips". HR Manager cannot create salary components/structures (`payroll.config`), Manager cannot correct attendance (`attendance.manage`). Reachable routes per seeded role: admin 353, hr_manager 131, hr_executive 108, manager 98, employee 111. | 📄 `config/navigation.ts:129-130,140-141,156,169-171,179,185-186`; `backend/src/models/role.model.ts:46-85` |
| P1 | ID Card generator prints a **decorative icon instead of a QR code**, hard-codes the company as "DD HRMS", computes validity client-side and never calls the server's `/id-cards/generate/:employeeId` → printed cards cannot be scanned at `/verify/:code` and differ from the real server-rendered card on "My ID card". | ✅ `pages/id-cards/IDCardPage.tsx:32-54,381-383`; `backend/src/routes/id-card.routes.ts` |
| P1 | Global search (⌘K) is populated with **mock data** ("Priya Sharma", "Acme Corp", "Project Atlas") linking to 404s (`/employees/1`, `/crm/customers`, `/projects/1`), pushes nav parents with `to: undefined`, has no permission filtering (employees see Payroll/Roles/Backup), and never calls the backend `/search`. | 📄 `components/common/CommandPalette.tsx:44-52,93-106,153` |
| P1 | Dead HR actions: Employee detail "Deactivate" has no `onClick` (hook `useUpdateEmployeeStatus` exists unused); list "⋯" button has no handler; "Export" shows `toast.info('Export functionality is coming soon')` although `GET /employees/export` exists. | 📄 `pages/employees/EmployeeDetailPage.tsx:84-86`; `EmployeeListPage.tsx:167-169,186`; `hooks/use-systemcore.ts:287-302` |
| P1 | Links to non-existent routes (404 page): notification dropdown footer → `/notifications`; onboarding checklist "Invite" → `/users` (shown to every admin on the dashboard); keyboard shortcut `g c` → `/crm`; cookie banner and login page "privacy policy" → `/privacy` (file is `/privacy-policy.html`). | ✅📄 `components/layout/NotificationDropdown.tsx`; `components/common/OnboardingChecklist.tsx:73`; `layouts/DashboardLayout.tsx:23`; `components/common/CookieConsent.tsx:104` |
| P1 | Employees see management-only buttons on their own records: Disciplinary detail shows Acknowledge/Escalate/Close/Cancel/Edit/Delete to everyone (and fetches `/users` → 403); Policy detail shows Publish/Record acknowledgement/Archive/Restore/Edit/Delete to anyone with `policies.view` (every employee) → 403 toasts. | 📄 `pages/disciplinary/DisciplinaryDetailPage.tsx:49-57,219-244`; `pages/hr-policies/PolicyDetailPage.tsx:178-208` |
| P1 | Employee attendance calendar marks **every past day without a record as "Absent"** (the server only synthesises holiday/week-off rows) → new joiners see red days before their joining date; everyone sees months before go-live as fully absent. | 📄 `pages/attendance/EmployeeAttendancePage.tsx:161-172`; `backend/src/controllers/attendance.controller.ts:841-862` |
| P1 | Leave calendar likely shifts entries by a day in IST (`toISOString().slice(0,10)` on local-midnight dates) and excludes the last day of the month from the query. | ❓ `pages/leaves/LeaveCalendarPage.tsx:18-21,37,56` |
| P2 | Projects pages (`ProjectListPage`, `ProjectDetailPage`, `KanbanBoard`, `TaskDetailDrawer`) have no route; the Field Sales nav group was removed on 2026-07-29 but `/field/*` routes remain URL-reachable with full CRUD; "Timesheets" nav item leads to a permanently empty page ("Log time from any project's Time tab" — no Projects module). | ✅ `router/index.tsx:186,214-222`; `config/navigation.ts:148,198-200` |
| P2 | Employee dashboard "Latest payslip" card shows no month/year (reads `.month/.year`; API populates `cycleId.month/year`). | 📄 `pages/dashboard/EmployeeDashboardPage.tsx:444` |
| P2 | Refresh failure leaves a half-logged-out state: tokens cleared and redirect to `/login`, but the persisted `opencore.auth` store is never cleared and queued requests never settle → bounce between `/dashboard` and `/login`. Refresh token lives in `localStorage`. | 📄 `lib/axios.ts:5-19,95-128`; `router/index.tsx:130-138` |
| P2 | 4xx query errors are swallowed and rendered as empty states (an employee who opens `/employees` sees "No employees found — Add your first employee"); `DataTable` has no error state; admin users without an employee profile get silent empty states on My Attendance / My Leaves / Timesheet / My Expenses. | ✅📄 `main.tsx:77-83`; `components/ui/data-table.tsx:48-54`; `pages/employees/EmployeeListPage.tsx:275-276` |
| P2 | Destructive actions with no confirmation: delete site / allowed IP / QR code / salary component / salary structure / location / employee document, and **Lock cycle** (irreversible). | 📄 `pages/attendance/AttendanceSitesPage.tsx:88`, `AllowedIPsPage.tsx:79`, `QRCodesPage.tsx:89`; `pages/payroll/SalaryComponentsPage.tsx:154`, `SalaryStructuresPage.tsx:163`, `PayrollDashboardPage.tsx:233`; `pages/locations/LocationsPage.tsx:186`; `pages/employees/EmployeeDetailPage.tsx:413-416` |
| P2 | Hard caps with no pagination: leave approvals (50), expense claims (50), leave balances (200), documents (100), notices (server default) → older requests silently vanish for approvers. | 📄 `pages/leaves/LeaveListPage.tsx:36`, `MyLeavesPage.tsx:52`; `pages/expense-claims/ExpenseListPage.tsx:100`, `MyExpensesPage.tsx:70`; `pages/leaves/LeaveBalancePage.tsx:37`; `pages/documents/DocumentsPage.tsx:142` |
| P2 | Web check-in widget offers every server-enabled method (Face, Static/Dynamic QR, Office IP, Device) but always sends only `{method, location}` → picking "Face Recognition" records a face check-in without a face, or errors. | 📄 `components/attendance/CheckInWidget.tsx:79-81,102,186-193` |
| P2 | Attendance QR codes are rendered by a third party (`api.qrserver.com` receives the secret code; printing needs that host online); copy says "rotates every 45 seconds" while the code rotates every 30 s. | ✅ `pages/attendance/QRCodesPage.tsx:22-24,49,179` |
| P2 | HR Policies: the form promises Markdown rendering but the detail page prints raw text; there is no "I acknowledge" button for the signed-in employee — HR records acknowledgements on their behalf, although policies are "Mandatory — every employee must acknowledge". | 📄 `pages/hr-policies/PolicyFormPage.tsx:270-277`; `PolicyDetailPage.tsx:257-259,495-532` |
| P2 | Documents: Delete is shown on every file to every user (server → 403); "New folder" dialog creates nothing (just switches the path). | 📄 `pages/documents/DocumentsPage.tsx:187-196,384-391` |
| P2 | Calendar empty-state "Add event" ignores `canManage` → 403 on submit. | 📄 `pages/calendar/CalendarPage.tsx:339-346` |
| P2 | Add-Employee form autosaves every field — including password, bank account, IFSC, PAN — to `localStorage` and restores it into the next new-employee form; "Next" silently does nothing when last name/e-mail are invalid because no error text is rendered for them. | 📄 `pages/employees/EmployeeFormPage.tsx:89,177-197,296-321,402-408` |
| P2 | Asset import template is seeded with **real employee names and personal Gmail addresses** (PII baked into the bundle and source maps); employee import silently drops rows missing any required field and documents 5 columns while the parser accepts 17. | ✅📄 `pages/assets/AssetImportModal.tsx:93-121`; `pages/employees/EmployeeImportModal.tsx:125,221-224` |
| P2 | Source maps shipped to production (`sourcemap: true`; 163 `.map` files) → full TypeScript source (incl. the PII above) downloadable from hrms.ddipl.org. | ✅ `vite.config.ts:63`; `dist/assets/*.map` |
| P2 | Privacy/compliance copy contradicts the app: the policy says "no Sentry" while Sentry session replay ships; the cookie banner collects Marketing/Preferences consent that nothing uses; Settings → Privacy is mostly empty placeholders (unused `ConsentToggle`/`DeleteAccountForm`) although Settings promises "GDPR/DPDP requests"; backend `GET /api/v1/privacy-policy` is branded "Tankar Solutions HRMS / support@tankarsolutions.com". | 📄 `public/privacy-policy.html`; `lib/sentry.ts`; `components/common/CookieConsent.tsx:111-128`; `pages/settings/PrivacyPage.tsx:56-57,102-135`; `backend/src/routes/index.ts` |
| P2 | i18n is dead (39 keys, `t()` used only in a never-rendered `LanguageSwitcher`) but still has side effects: Arabic-locale browsers get `<html dir="rtl">` over an all-English UI and Arabic-Indic digits in number formatting. | ✅📄 `i18n/index.ts:62-66`; `layouts/DashboardLayout.tsx:16`; `lib/format.ts:13-16` |
| P2 | UTC date maths in quick ranges and default dates (wrong before 05:30 IST): attendance "Today/This week", timesheet week start, expense/project default dates; `toLocaleDateString()` without locale (US format) on QR codes, field tasks, employee detail, audit logs, privacy page. | 📄 `pages/attendance/AttendanceListPage.tsx:50-52,123-128`; `pages/projects/TimesheetPage.tsx:30`; `pages/expense-claims/MyExpensesPage.tsx:82,120`; `pages/attendance/QRCodesPage.tsx:68,73`; `pages/settings/AuditLogsPage.tsx:237,339` |
| P2 | Employee pickers include inactive/exited staff ("Allocate to all employees" gives ex-employees balances; same in asset assign, loan, disciplinary, attendance, overtime, employee forms); "Reset Balances" wipes the whole year behind one `confirm()`. | 📄 `pages/leaves/LeaveBalancePage.tsx:39-51,75-78`; `pages/assets/AssetDetailPage.tsx:57`; `pages/loans/LoanFormPage.tsx:54`; … |
| P2 | Analytics Overview shows "Field Operations" and "Top Performers" sections that stay permanently empty for an HR deployment; Backups page says "last day of every month" but shows "Next run: 28 Oct 2026". | ✅ `pages/dashboard/OverviewPage.tsx:271-353`; `pages/system-backups/BackupsPage.tsx` |
| P2 | Branding/product naming inconsistent: "DD HRMS" (title, sidebar, ID cards), "Dharmesh Deshani Group of Companies" (login), "DDIPL" / "D-HRMS" (support page, stores), "Tankar Solutions HRMS" (backend policy), `{slug}.ddhrms.com` / `onboarding@ddhrms.com` (signup success), storage keys `opencore.*`, "Your Company Name" (server payslips). | ✅📄 `layouts/AuthLayout.tsx`; `pages/public/SupportPage.tsx:14-21`; `pages/auth/SignupSuccessPage.tsx:22,58,101-102`; `lib/axios.ts:5-6` |
| P3 | Dashboard "Reports" button just links to the employee list. | 📄 `pages/dashboard/DashboardPage.tsx:91-95` |
| P3 | SaaS leftovers: `SignupSuccessPage` (workspace/subdomain copy), i18n `auth.signUp = "Create workspace"`, `lib/phase1.api.ts` super-admin/tenant APIs for routes that do not exist. | 📄 |
| P3 | Notice modal on the employee dashboard reopens after "Read later" on every refetch and renders HTML notices as raw text (the board renders them as HTML); notice form cannot target departments although the API supports it. | 📄 `pages/dashboard/EmployeeDashboardPage.tsx:136-144,727-729`; `pages/notices/NoticeBoardPage.tsx:58-64,314-317` |
| P3 | Notification click does a full page reload (`window.location.assign`); no avatar upload although the API accepts `avatar`; Holidays page is current-year only with no import UI; Sites/Locations have no edit or employee-assignment UI although the APIs exist. | 📄 `components/layout/NotificationDropdown.tsx`; `pages/profile/ProfilePage.tsx`; `pages/holidays/HolidayListPage.tsx:63-64`; `pages/attendance/AttendanceSitesPage.tsx`; `pages/locations/LocationsPage.tsx:113` |
| P3 | Payroll cycle edit icon is `disabled` with no disabled styling; expense currency is free text and accepted amount may exceed the claimed amount. | 📄 `pages/payroll/PayrollCycleDetailPage.tsx:178-184`; `pages/expense-claims/MyExpensesPage.tsx:251`, `ExpenseListPage.tsx:364-369` |
| P3 | External runtime dependencies: geocoding via `nominatim.openstreetmap.org`, marker icons from cdnjs, OSM tiles — blank on a restricted office network. | 📄 `pages/attendance/GeofencePage.tsx:87`; `components/field/LiveMap.tsx:8-10` |
| P3 | `console.info` left in `main.tsx:29`; `socket.io-client` dependency and `VITE_SOCKET_URL` documented but nothing imports them; unused components/hooks (`search-command.tsx`, `LanguageSwitcher.tsx`, `Skeletons.tsx`, `use-locale.ts`, `useSocketNotifications`). | ✅📄 |
| P3 | ESLint cannot run in either project (`.eslintrc*` is git-ignored and absent) → `npm run lint` fails. | ✅ |
| P3 | Only `common.json` (39 keys) exists for hi/ar; nearly all UI strings are hard-coded English (fine if English-only is intended — then remove the language machinery). | ✅ `scripts/check-translations.ts` output |

### 3.7 Mobile app (Android `com.tankarsolutions.hrms`, iOS "D-HRMS")

Working core: login, manual/QR check-in, expense-gated check-out, leave apply/history/balance, payslips, notices, expenses, overtime, policies, assets, loans, holidays, ID card. **24 field-sales screens are compiled into the app but unreachable** (drawer/launcher entries removed); if re-enabled they are broken end-to-end.

| Sev | Finding | Evidence |
|---|---|---|
| P0 | Store metadata in `store/` describes a different product ("Fieldora Prime": team chat, video calls, 2FA, biometric unlock, offline sync — none exist). Support/marketing URLs point to fieldoraprime.com. Misleading-metadata rejection risk; wrong support contact. | 📄 `dhrms-iosfinal/store/appstore/*`, `store/playstore/*` |
| P0 | Team Calendar crashes the app (server returns `LeaveRequest[]`, screen does `d.employees.map`); there is **no ErrorBoundary** anywhere. | 📄 `src/screens/leave/TeamCalendarScreen.tsx:41` |
| P0 | Push notifications do not exist end-to-end: `push-notifications.ts` is never imported, no message handlers, backend has no FCM/APNs sender (`firebase-admin` not a dependency). Prod `pushdevices` = 0. | ✅📄 `src/lib/push-notifications.ts`; `backend/package.json` |
| P1 | Failed token refresh dead-ends the session: queued requests never settle, auth store never cleared → endless spinners until manual logout. | 📄 `src/api/client.ts:66-95` |
| P1 | Timesheet and Geofence screens are 403 for every normal employee (`/attendance/records`, `/attendance/geofences` need `attendance.view`) → "No records" / "No geofence zones". | 📄 `src/api/attendance.api.ts:172,261`; `backend/src/routes/attendance.routes.ts:47-52,125-130` |
| P1 | Profile / Digital ID / Edit Profile: `GET /employees/me` is routed to `GET /employees/:id` → **403** for employees (needs `employees.view`) or **400 "Invalid _id: me"** for admins — never 404, so the `/auth/me` fallback never fires and the screens error out; even when the fallback is forced, there is no phone/department/designation/joining date/employee ID, and phone/address edits are silently discarded while the UI says "Saved". | ✅📄 `src/api/employee.api.ts:153,160,178-183`; `EditProfileScreen.tsx:67`; `backend/src/routes/employees.routes.ts:32` |
| P1 | Employee Directory (drawer + quick-launch) is fully broken: `/employees/directory*` routes don't exist. | 📄 `src/api/employees.api.ts:99-109` |
| P1 | Face attendance is a stub (placeholder string after a `setTimeout`, no camera) — always "Face verification failed". | 📄 `FaceAttendanceScreen.tsx:19-36` |
| P1 | Break screen can never start a break (`today` adapter drops `breaks` and flattens `checkIn`). | 📄 `BreakScreen.tsx:51-57`; `attendance.api.ts:107-130` |
| P1 | Live tracking is foreground-only (`setInterval` + `getCurrentPosition`, no background library, no mock-location check) → admin map goes stale as soon as the phone locks. | 📄 `src/hooks/useLiveTracking.ts:63-96` |
| P1 | Notice alert re-fires on every Home visit (server never sends `acknowledged`). | 📄 `HomeScreen.tsx:95-115` |
| P1 | Half-day leave is submitted as a full day (`halfDay` vs server `isHalfDay`). | 📄 `src/api/leave.api.ts:141` |
| P1 | Field module contracts broken: visit check-in/out → 400 (payload shape + enum), create order → 400 and product catalogue → 404 (no routes), add client → 400, receipt → 404, order/payment lists crash on `item.client.name` (server sends `clientId`). | 📄 `VisitCheckInScreen.tsx:138-144`; `VisitCheckOutScreen.tsx:36-43`; `field-order.api.ts:58-74`; `AddClientScreen.tsx:33-43`; `field-payment.api.ts:44`; `PaymentHistoryScreen.tsx:47`; `OrderListScreen.tsx:52-58` |
| P1 | ResetPasswordScreen unreachable (deep linking commented out; email link uses the web origin). | 📄 `App.tsx:64` |
| P2 | Tokens stored in plain MMKV (no encryption key / Keychain). | 📄 `src/api/storage.ts:3` |
| P2 | Logout doesn't revoke the server session (no `refreshToken` sent) and doesn't clear the query cache (24 h) → next user on a shared device can see the previous user's data. | 📄 `DrawerNav.tsx:47-51`; `App.tsx:37` |
| P2 | "App lock" unlocks on any tap (TODO); "Biometric" toggle just stores a flag. | 📄 `components/common/AppLockOverlay.tsx:73-80`; `SettingsScreen.tsx:155-161` |
| P2 | Uploaded receipt / document URLs are relative (`/uploads/...`) → images never render; Documents screen shows "— · Invalid Date" and tap does nothing (field-name mismatch). | 📄 `expense.api.ts:95-100`; `DocumentsScreen.tsx:68-92` |
| P2 | Month/date windows off by one day in IST (`toISOString()` on local dates) in attendance history, shifts, expense and overtime default dates. | 📄 `attendance.api.ts:256-257`; `MyShiftsScreen.tsx:35-37`; `SubmitExpenseScreen.tsx:33`; `OvertimeScreen.tsx:52` |
| P2 | Errors render as "No records" (403/500/offline look like empty data) on 6 list screens. | 📄 `AttendanceHistoryScreen.tsx:54`, `PayslipListScreen.tsx:21`, `LeaveHistoryScreen.tsx:20`, … |
| P2 | No offline queue; check-ins fail outright without network. | 📄 `src/lib/query-persist.ts:30-58` |
| P2 | All 13 list screens capped at 50/200 items with no pagination. | 📄 |
| P2 | Settings rows that do nothing: Terms, Export my data ("request sent" — fake), Support, What's new, Clear cache, Push/DND toggles, Language picker ("rolls out in 10.1"), version hard-coded `0.1.0` (app.json says `0.1.2`). | 📄 `SettingsScreen.tsx:78-313` |
| P2 | Fake KPI numbers: "5-day streak", "+2%", unread dot always on, "New clients 3", "Swaps 0", static "vs last month". | 📄 `HomeScreen.tsx:237,318-322`; `AttendanceScreen.tsx:124-140` |
| P2 | GPS accuracy never enforced; location optional for manual check-in. | 📄 `src/utils/location.ts:30-43`; `AttendanceScreen.tsx:163-168` |
| P2 | Branding inconsistent inside the app (`D-HRMS`, `DDHRMS`, `HRMS`, `DD HRMS`, "Tankar Solutions HRMS"). | 📄 |
| P2 | Unused native deps that still need native config (`@react-native-firebase/*` without `google-services.json` crashes at launch, `react-native-maps` + manual `patch-maps.js`); `react-native-screens` disabled app-wide to dodge a crash. | ❓ `package.json`; `index.js:6-8` |
| P3 | `@sentry/react-native` imported but not installed; `sentryDsn`/`codepushKeys` empty → no crash reporting or OTA. | 📄 `src/lib/sentry.ts:30`; `app.json` |
| P3 | Unauthenticated requests fired on the login screen (`useLiveTracking` runs before login). | 📄 `App.tsx:55` |
| P3 | Dead/placeholder UI: photo buttons without handlers, "Share coming soon", "Interactive map available in full version", Start/Stop tracking flips an unread flag, rows that only vibrate. | 📄 |
| P3 | Stray `console.log`s; free-text date on Regularization; pull-to-refresh missing on ~45 screens; holiday/calendar enums don't match server; `tel:`/`whatsapp:` links need Android `<queries>`. | 📄❓ |
| P3 | Native folders (`ios/`, `android/`) and the Android release keystore are not on this Mac — a store release cannot be built here until they are restored from another machine. | ✅ |

### 3.8 API contract & permissions cross-check (web ↔ backend ↔ mobile)

Method: all 365 backend routes were extracted with their auth/permission middleware (mount chain `index.ts:146` → `routes/index.ts`), then every API call in the web app (340) and mobile app (95) was matched against them, and the permission strings used by the UI were compared with the backend catalogue and the seeded roles. Response envelopes (`{success, data, pagination}`) were spot-checked on 17 core flows — **no response-shape mismatches** were found; every web call matches a real route with the right method (only the dead `lib/phase1.api.ts` super-admin/tenant calls have no backend).

| Sev | Finding | Evidence |
|---|---|---|
| P1 | **Mobile calls that hit the wrong or no route**: `GET /employees/me` → `GET /employees/:id` (403 employee / 400 admin); `GET /employees/directory` → same (403/400); `GET /employees/directory/:id`, `/employees/directory/stats` → 404; `GET /field/products`, `/field/products/:id`, `/field/products/categories`, `GET /field/payments/:id/receipt`, `POST /field/uploads/photo` → 404 (field module, deep-link only). `PATCH /employees/:id` from Edit Profile needs `employees.update`, which employees lack. | ✅📄 `dhrms-iosfinal/src/api/employee.api.ts:153,197`; `employees.api.ts:99-109`; `field-order.api.ts:58-69`; `field-payment.api.ts:44`; `visit.api.ts:211` |
| P1 | **Seeded roles vs routes** (details in 3.6): HR Manager / HR Executive / Manager lack `attendance.checkin`, `leaves.create`, `expenses.*`, `holidays.view` (and Manager / HR Executive lack `payroll.view`) → self-service 403 on both clients; mobile has **no role gating at all**, so these users see every screen and get 403s. Route permissions held by **no** seeded non-admin role (admin-only via `*`): `assets.*`, `attendance.approve`, `attendance.config`, `audit.view`, `departments.*`, `designations.*`, `disciplinary.*`, `expenses.approve`, `field-sales.*`, `holidays.create/update/delete`, `leaves.delete/update`, `loans.*`, `overtime.view/approve`, `payroll.config`, `policies.manage`, `projects.*`, `roles.*`, `settings.manage`, `shifts.*`, `users.*`. | 📄 `backend/src/models/role.model.ts:33-82` |
| P1 | **Permission catalogue ≠ route permissions**, so custom roles built in the Roles UI silently 403: 22 permissions that routes check are **missing from the catalogue** (`attendance.checkin`, `attendance.approve`, `departments.create/update/delete`, `designations.create/update/delete`, `events.manage`, `expenses.view/create/update/delete/approve`, `leaves.create`, `leaves.delete`, `projects.create/update/delete`, `shifts.create/update/delete`), and 16 catalogue entries are checked by **no route** (`backups.view/manage`, `departments.manage`, `designations.manage`, `documents.view/manage`, `employees.export`, `expense-claims.view/approve/update`, `leaves.config`, `notices.view/manage`, `projects.manage`, `settings.view`, `shifts.manage`). The web UI also gates on `roles.manage`, which exists nowhere. | 📄 `backend/src/controllers/roles.controller.ts:87-111`; `frontend/src/config/navigation.ts:82-88` |
| P1 | **Attendance regularization approval is unreachable**: `PATCH /attendance/regularize/:id` requires `attendance.approve` (no seeded role has it) and the web hook `useDecideRegularization` has no consumer — no screen approves regularizations. | 📄 `backend/src/routes/attendance.routes.ts`; `frontend/src/hooks/use-attendance.ts:164` |
| P2 | Auth-only routes with **no permission and no controller ownership check** (any logged-in employee): backups list/create/restore/delete/schedule; notices create/edit/delete; locations CRUD + assign employees; overtime read/edit/withdraw anyone's request and create OT for any employee via `body.employee`. | ✅📄 `backup.routes.ts:10-23`; `notice.routes.ts:11-14`; `location.routes.ts:11-15`; `overtime.routes.ts:21-24` |
| P2 | 31 backend routes are used by neither client (dead API surface to maintain or remove), e.g. `POST /users`, `GET|PATCH|DELETE /users/:id`, `GET /employees/export`, `POST /holidays/import-calendar`, `GET /search`, `GET /team/overview`, `POST /auth/logout-all`, `GET /auth/verify-email/:token`, `GET /id-cards/generate/:employeeId`, `/id-cards/templates*`, `POST /field/clients/import`, `POST /projects/:id/members`, `GET /roles/:id`, `POST /admin/test-email`. 252 routes are web-only, 10 mobile-only. | 📄 |
| P2 | `GET /api/metrics` (Prometheus) and `/api/health`, `/api/readyz` are unauthenticated and mounted at `/api` (not `/api/v1`) — unreachable through nginx, reachable through the exposed port 4000. | 📄 `backend/src/routes/health.routes.ts:22,40,66` |
| P3 | Web `getRoleBadge` references role slugs that are never seeded (`super_admin`, `hr`, `field_sales_rep`, `field_sales_manager`, `accountant`, `sales_executive`). | 📄 `frontend/src/lib/permissions.ts:52-80` |

### 3.9 Code quality & process

| Sev | Finding | Evidence |
|---|---|---|
| P0 | Source not in git; only `dist/` committed (see #12). | ✅ |
| P1 | **Zero automated tests** in backend, frontend and mobile (`vitest` configured, no `*.test.ts` files). | ✅ |
| P1 | Frontend type-check fails (29 errors); no CI gate. | ✅ |
| P1 | ESLint config missing in both projects. | ✅ |
| P2 | `README.md` says `npm run seed` creates `admin@example.com / Admin@123`; the seed only creates roles — a fresh install has **no way to log in except the public signup hole**. `seed-admin.ts` exists but isn't in `package.json` and resets the well-known password on every run. | ✅ `backend/src/scripts/seed.ts:13-34`, `seed-admin.ts:47-52` |
| P2 | `.env.example` is missing documented keys the code reads (`COMPANY_GSTIN`, `COMPANY_STATE_CODE`, `GST_RATE_PERCENT`, `RESEND_API_KEY`, `AGORA_*`); the server `.env` is missing `REDIS_URL`, `MEILISEARCH_HOST`, `MEILISEARCH_API_KEY`. | ✅ |
| P2 | Dead SaaS leftovers: `docs/modules.md` describes a 56-module product with CRM/Finance/subscription plans; `email-templates.ts` (trial/payment/invoice/ticket mails, default `https://ddhrms.com`), `announcement.model.ts`, `tax.service.ts` GST engine, 30+ empty prod collections (`leads`, `pipelines`, `aiconversations`, `journalentries`, `tickets`, …). | ✅📄 |
| P3 | Windows line endings on the Mac copy make ~20 files show as modified in git with no real change. | ✅ |
| P3 | `backend/dist/.d.ts` files are not committed (harmless); `backend/package-lock.json` modified on the server. | ✅ |

---

## 4. Suggested order of work

**Phase 0 — today, server only, no code changes (≈1 hour)**
1. nginx: `location = /api/v1/auth/register { return 404; }` and `location ~ ^/uploads/(backups|payslips)/ { deny all; }`.
2. `ufw default deny incoming; ufw allow 22,80,443/tcp; ufw enable` (and/or bind the API to 127.0.0.1).
3. Move `/var/www/hrms-new/backend/uploads/backups/*` out of the web root; check the `users` collection for admin accounts you don't recognise.
4. Fill `SMTP_PASS`, `SMTP_FROM`, `COMPANY_NAME`, `COMPANY_GSTIN`, `MEILISEARCH_*` in `.env`; start Meilisearch (or accept that search is off).
5. `pm2 install pm2-logrotate`; `pm2 flush` (the logs contain live tokens); enable `fail2ban`; disable SSH password login once key login works.

**Phase 1 — security fixes in code (first release)**
Items #1, #4, #5, #6, #7, #11 above; authenticated file downloads with random keys; upload type allow-list; permission gates on backups/notices/locations; ownership scoping on expenses/leaves/overtime/attendance-monthly/field routes; strip reset/verification tokens from user responses; validate role/permission assignment; `redact` in pino; Redis fail-safe (`maxRetriesPerRequest` for app connection, ping timeout).

**Phase 2 — HR/payroll correctness**
Absent-marking + auto-checkout job; leave → attendance stamping and paid/unpaid LOP; payroll state machine; pro-rata and final settlement; loan EMI + reimbursement integration; statutory report name matching; PF/ESI/PT rules configurable; TDS (at least a persisted manual line); salary structures either wired or hidden; seeded role permissions fixed; notifications/emails on leave/expense/OT decisions; night-shift check-out; shift fields honoured; year rollover/carry-forward.

**Phase 3 — mobile**
Fix the P1 contract mismatches (profile, directory, half-day, breaks, documents, receipts), add an ErrorBoundary, fix refresh dead-end, wire push (FCM/APNs on both sides), decide whether the field module ships (if yes, fix all contracts in 3.5/3.7; if no, strip it), rewrite store metadata, restore `ios/`/`android/` + keystore and set up signed builds.

**Phase 4 — engineering process**
Commit `src/`, build in CI (type-check + lint + tests must pass), stop committing `dist/`, add tests for auth/attendance/leave/payroll maths, pin `TZ`, document env keys, remove dead SaaS code.

---

## 5. Appendix — what was run

- Local run of the deployed build: `node backend/dist/index.js` + `vite` dev server against a scratch MongoDB (port 27018) and Redis (port 6380), seeded with `npm run seed`; local-only env in `backend/.env` (git-ignored); launch config in `.claude/launch.json`.
- Browser sweep of every route in `frontend/src/router/index.tsx` as an admin, recording page text, console errors and every API response code.
- API flow: register ×3 → login → `POST /employees` (with password) → login as employee → check-in/duplicate/check-out → list backups → create notice → upload `.html` → fetch without auth → payroll cycle create/process/generate-payslips → fetch payslip without auth → backup now → fetch backup without auth → 40 failed logins.
- Server (read-only): `pm2 list/describe`, `ss -ltnp`, `ufw status`, `sshd -T`, `.env` key names and secret lengths (values not read), nginx config, SSL expiry, `mongosh` collection counts, pm2 log greps (counts only), external `curl` to port 4000 and to `/uploads/backups/...`.
- Static checks: `tsc --noEmit` (backend 0 errors, frontend 29), `eslint` (no config), `scripts/check-translations.ts`.
