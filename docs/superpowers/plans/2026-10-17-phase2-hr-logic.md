# Phase 2 — HR Logic Correctness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attendance, leave, payroll and approvals produce correct numbers for an Indian company: employees who never show up are marked absent and not paid, approved leave flows into attendance and payroll, payroll cycles cannot be silently wiped, joiners/leavers are pro-rated, loans and reimbursements are settled through payroll, statutory deductions follow configurable rules, and managers approve only their own team.

**Architecture:** Attendance rows become the single source of truth for a paid/unpaid day: a nightly job stamps `absent`/auto-checkout rows, leave approval stamps `on_leave`/unpaid rows, and payroll reads only rows (plus loans and approved claims). Payroll computation moves into a pure service with a strict cycle state machine; statutory maths lives in one configurable module. Approval scoping is a shared helper driven by new `*.approve_all` permissions versus `reportingManager`.

**Tech Stack:** Node 22, Express 5, Mongoose 8, BullMQ (repeatable jobs with `tz: 'Asia/Kolkata'`), zod, vitest + supertest + mongodb-memory-server (backend harness from Phase 1); React 19 + Vite (frontend).

**Spec:** `docs/production-audit.md` sections 3.3 (all P0/P1, the P2 rows named in tasks), 3.4 payroll/expense/loan P1 rows plus the P2 rows named in tasks, 3.2 "manager-chain" rows, 3.8 regularization approval; plus the Phase 1 ledger deferrals for manager scoping and the regularization screen.

## Global Constraints

- Branch: `phase2-hr-logic` from `main` at `577e292`. Commit per task; never push. `backend/dist` and `frontend/dist` stay tracked and are rebuilt in the last task.
- Backend `npm run type-check` and `npx vitest run` (currently 262) green at the end of every task; frontend type-check + vitest green at the end of Task 13.
- Existing production data keeps working with **no migration**: every new schema field is additive with a default; existing payroll cycles are never recomputed by deploy; the nightly job only ever acts on *today/yesterday* unless an admin explicitly backfills a date range (max 62 days).
- Mobile app API contract is preserved: existing request bodies for `/attendance/check-in`, `/check-out`, `/regularize`, `/leaves/requests`, `/expense-claims/requests` keep working; new fields are optional.
- Business timezone is `Asia/Kolkata` everywhere a "day" is computed (`lib/business-day.ts`); attendance `date` stays the UTC-midnight label of the IST day.
- Money: 2-decimal rounding via the existing `round2`; ESI employee share rounds **up** to the rupee; PT per the slab tables; INR only.
- Permission names come only from `backend/src/config/permissions.ts`; the static test keeps enforcing it.
- Copy uses "DD HRMS".

## Review Focus

1. A day with an approved paid leave **and** a punch counts once as a paid day (not double, not LOP) — Task 8 test `counts a punched paid-leave day once`.
2. Re-processing a `processed` cycle after HR entered arrears/advance keeps those manual adjustments — Task 7 test `re-process preserves manual adjustments`.
3. An employee who joined on the 20th of a 30-day month is paid 11/30, and one who exited on the 10th is paid 10/30 (final settlement) — Task 8 tests `joiner pro-rata`, `leaver final settlement`.
4. A night-shift check-out after midnight closes **yesterday's** record and computes hours across midnight — Task 5 test `night shift check-out`.
5. The nightly job never marks absent on a week-off, public holiday, approved-leave day, before the joining date, or after the exit date — Task 2 tests.

---

### Task 1: Branch, additive model fields, day classifier

**Files:**
- Create: `backend/src/lib/day-classifier.ts`, `backend/src/lib/day-classifier.test.ts`
- Modify: `backend/src/models/employee.model.ts` (add `isFieldStaff: { type: Boolean, default: false }`, `salaryStructureId: { type: ObjectId, ref: 'SalaryStructure' }`, `salary.tdsMonthly: { type: Number, default: 0 }`, `statutory: { esiEligible: Boolean, esiPeriodKey: String }`), `backend/src/models/attendance.model.ts` (add `leaveRequestId?: ObjectId`, `isPaidLeave?: boolean`, `source: { type: String, enum: ['punch','leave','auto_absent','auto_checkout','regularization','correction'], default: 'punch' }`; regularization sub-schema gets `requestedCheckIn?: Date`, `requestedCheckOut?: Date`), `backend/src/models/attendance-config.model.ts` (`settings.expenseBeforeCheckout: { type: String, enum: ['all','field','none'], default: 'all' }`), `backend/src/models/payroll-record.model.ts` (line schema gets `statutoryType?: 'pf'|'esi'|'pt'|'tds'`; record gets `manualAdjustments: { arrears, advance, expense, reimbursements, loanDeduction, tds: Number|null, note: String }` all default `null` meaning "not overridden", and `tds: Number default 0`), `backend/src/models/payroll-cycle.model.ts` (add `lockedAt`, `lockedBy`, `paidAt`, `paidBy` if missing), `backend/src/models/holiday.model.ts` (unique index `{ date: 1, name: 1 }` — autoIndex is off in prod; Task 14 adds it to the checklist)
- Modify: `backend/src/controllers/attendance.controller.ts#updateConfig` schema to accept `expenseBeforeCheckout`; `backend/src/controllers/employees.controller.ts` create/update schemas accept `isFieldStaff`, `salaryStructureId`, `salary.tdsMonthly`

**Interfaces:**
- `classifyDay(date: Date, ctx: { workDays: number[]; weekOffRule: WeekOffRule; holidays: HolidayLite[]; departmentId?: ObjectId|string|null }): 'working' | 'weekend' | 'holiday'` where `HolidayLite = { date: Date; type: 'public'|'optional'|'restricted'; departments: (ObjectId|string)[] }`. A holiday counts only when `type === 'public'` and (`departments` is empty or contains `departmentId`). Week-off wins over holiday.
- `listHolidaysBetween(start: Date, end: Date): Promise<HolidayLite[]>` (one query, lean).

- [ ] **Step 1: Branch** — `git checkout -b phase2-hr-logic`.
- [ ] **Step 2: Write failing tests** for `classifyDay`: Sunday → `weekend`; 4th Saturday → `weekend` (default rule); a public holiday on a Monday → `holiday`; an `optional` holiday on a Monday → `working`; a public holiday restricted to dept A: dept A → `holiday`, dept B → `working`; a Monday with no holiday → `working`; a `workDays` of `[1,2,3,4,5]` makes Saturday `weekend`.
- [ ] **Step 3: Run to verify they fail.**
- [ ] **Step 4: Implement** the classifier reusing `isWeekOff` and `toKey` from `lib/week-off.ts`; add the model fields; extend the two schemas.
- [ ] **Step 5: Run the suite + type-check.**
- [ ] **Step 6: Commit** — `feat(hr): additive attendance/payroll/employee fields; day classifier`

---

### Task 2: Nightly day-close job (auto-absent + auto-checkout) and admin backfill

**Files:**
- Create: `backend/src/services/day-close.service.ts`, `backend/src/services/day-close.service.test.ts`, `backend/src/jobs/attendance.jobs.ts`
- Modify: `backend/src/index.ts` (start the attendance worker and register the repeatable job, non-awaited, after the backup worker), `backend/src/routes/attendance.routes.ts` (`POST /close-day` and `POST /close-days` → `requirePermission('attendance.manage')`), `backend/src/controllers/attendance.controller.ts` (handlers + zod schemas), `backend/src/test/setup.ts` (mock `../jobs/attendance.jobs.js` exports like the backup mock), `backend/src/lib/attendance-hours.ts` (create: `computeHours(att, now)` extracted from the existing `workedHours`, plus `applyShiftRules(att, shift|null, cfg)` → sets `lateBy`, `earlyLeaveBy`, `overtimeHours`, half-day status — shared with Task 5/6)

**Interfaces:**
- `closeBusinessDay(dateIST: Date, opts?: { dryRun?: boolean }): Promise<{ absentCreated: number; leaveStamped: number; autoCheckedOut: number; skipped: number }>` — `dateIST` is any instant; the service resolves it to the IST calendar day. For every `Employee` with `status: 'active'` (and `exitDate` null or ≥ day) and `joiningDate ≤ day`: skip if `classifyDay(...) !== 'working'`; if an approved `LeaveRequest` covers the day → ensure the leave row exists (via Task 3's `stampLeaveDays`; until Task 3 lands, create `{ status: isPaid ? 'on_leave' : 'absent', isPaidLeave, leaveRequestId, source: 'leave' }`); else if no `Attendance` row → create `{ status: 'absent', source: 'auto_absent' }`. Then for every row of that day with `checkIn.time` and no `checkOut.time` → set `checkOut = { time: <autoCheckoutTime on that day, default 23:59 IST>, method: 'manual', metadata: { autoCheckout: true } }`, `source: 'auto_checkout'`, recompute via `computeHours` + `applyShiftRules`.
- Queue `attendance`, job `attendance-day-close` repeat `{ pattern: '59 23 * * *', tz: 'Asia/Kolkata' }` running `closeBusinessDay(new Date())`; a second repeatable `leave-year-open` (`30 0 1 1 *`, tz) is registered in Task 4.
- `POST /api/v1/attendance/close-day { date }` → runs for that day; `POST /api/v1/attendance/close-days { from, to }` → max 62 days, runs sequentially, returns per-day counts. Both audited.

- [ ] **Step 1: Write failing tests** (in-memory Mongo, no Redis): employee with no row on a working day → one `absent` row with `source: 'auto_absent'`; nothing on Sunday; nothing on a public holiday; nothing before `joiningDate`; nothing after `exitDate`; an open check-in gets `checkOut.time` at `autoCheckoutTime` (`cfg.settings.autoCheckoutTime = '19:00'`) and `totalWorkingHours > 0`; a day already having a row is untouched; running twice is idempotent (counts 0 the second time); `dryRun` writes nothing.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** the service, the jobs module (same shape as `backup.jobs.ts`: queue, worker, `startAttendanceWorker()`, `ensureAttendanceSchedules()`), the two endpoints, the `index.ts` wiring (`void ensureAttendanceSchedules().catch(warn)`), and the test mock.
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(attendance): nightly day-close job (auto-absent, auto-checkout) with admin backfill`

---

### Task 3: Leave approval stamps attendance; atomic balances; type rules; cancel policy; notifications

**Files:**
- Create: `backend/src/services/leave-attendance.service.ts`, `backend/src/services/leave-attendance.service.test.ts`
- Modify: `backend/src/controllers/leaves.controller.ts` (`applyLeave`, `approveLeaveRequest`, `rejectLeaveRequest`, `cancelLeaveRequest`, `deleteLeaveRequest`), `backend/src/services/notification.service.ts` (add `notifyLeaveDecision(userId, { status, leaveTypeName, startDate, endDate, link })`), `backend/src/routes/leaves.routes.ts` (cancel takes optional body `{ reason }`)
- Test: `backend/src/controllers/leaves.lifecycle.test.ts`

**Interfaces:**
- `stampLeaveDays(request: ILeaveRequest, leaveType: ILeaveType, employee: IEmployee): Promise<number>` — for each day in `[startDate, endDate]` that `classifyDay` says is `working`: upsert the `Attendance` row for that day: if `request.isHalfDay` → `status: 'half_day'`; else paid type → `status: 'on_leave'`; unpaid → `status: 'absent'`; always set `leaveRequestId`, `isPaidLeave = leaveType.paidLeave`, `source: 'leave'` **unless** the row already has `checkIn.time` (then only set `leaveRequestId`/`isPaidLeave` and leave the punch status alone). Returns the number of rows touched.
- `unstampLeaveDays(request): Promise<number>` — rows with that `leaveRequestId`: delete if `source === 'leave'` and no `checkIn.time`; otherwise unset the two leave fields.
- `availableBalance(employeeId, leaveTypeId, year): Promise<{ remaining: number; pending: number }>` where `pending` = sum of `days` of `pending` requests of that type/year.
- Approve does `LeaveBalance.findOneAndUpdate({ employeeId, leaveTypeId, year, $expr: { $gte: [{ $subtract: [{ $add: ['$allocated','$carried','$adjusted'] }, '$used'] }, days] } }, { $inc: { used: days } })` for paid types; `null` → 400 `INSUFFICIENT_BALANCE`.

- [ ] **Step 1: Write failing tests**: approve a 3-working-day paid leave → 3 `on_leave` rows with `leaveRequestId`; unpaid type → 3 `absent` rows with `isPaidLeave: false`; half-day → one `half_day` row; a day that already has a punch keeps `present`; cancel of an approved leave removes the stamped rows and restores `used`; two pending requests that together exceed the balance: the second apply → 400 (`pending` counted); approve when balance was consumed meanwhile → 400 `INSUFFICIENT_BALANCE` and `used` unchanged; `applicableGender: 'female'` type applied by a male employee → 400; `probationAllowed: false` for an employee whose `confirmationDate` is in the future → 400; `attachmentRequired` without attachments → 400; `isActive: false` → 400; `halfDayAllowed: false` with `isHalfDay` → 400; a request spanning Dec→Jan → 400 "apply separately per year"; self-cancel of an approved leave that started yesterday → 403; HR cancel of the same with `reason` → 200; on apply a notification is created for the reporting manager's user; on approve/reject the employee's user gets a notification (`Notification.countDocuments`).
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.** Keep `isUnpaidLeaveType` semantics; `deleteLeaveRequest` of an approved request also unstamps + restores.
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(leave): stamp attendance on approval; atomic balance; enforce type rules; cancel policy; notifications`

---

### Task 4: Leave year lifecycle (open year, pro-rata, carry-forward, new-joiner allocation)

**Files:**
- Create: `backend/src/services/leave-year.service.ts`, `backend/src/services/leave-year.service.test.ts`
- Modify: `backend/src/controllers/leaves.controller.ts` (`POST /balances/open-year` handler; `applyLeave` lazy allocation → `allocateForEmployee`; `resetLeaveBalances` resets `used` and `carried` only), `backend/src/routes/leaves.routes.ts` (`POST /balances/open-year` → `leaves.update`), `backend/src/controllers/employees.controller.ts` (`createEmployee` and `importEmployees` call `allocateForEmployee(employee, currentYear)`), `backend/src/jobs/attendance.jobs.ts` (register `leave-year-open` repeatable `30 0 1 1 *` tz Kolkata → `openLeaveYear(new Date().getFullYear())`)

**Interfaces:**
- `proRataAllocation(daysAllowed: number, joiningDate: Date, year: number): number` — full `daysAllowed` if joined before the year; otherwise `round half-up to 0.5` of `daysAllowed × (12 − joiningMonthIndex) / 12` (joining in January = 12/12, December = 1/12).
- `allocateForEmployee(employee, year): Promise<number>` — for every active leave type with `paidLeave !== false`: upsert `LeaveBalance` for `(employee, type, year)` with `allocated = proRataAllocation(...)` **only if** no balance exists (never overwrites); returns rows created.
- `openLeaveYear(year, opts?: { employeeIds?: string[] }): Promise<{ created: number; carried: number; skipped: number }>` — for every active employee: `allocateForEmployee`; then for types with `carryForward.enabled`: if the new balance's `carried === 0`, set `carried = min(max(prevRemaining, 0), carryForward.maxDays)` where `prevRemaining` comes from year−1's balance. Idempotent.

- [ ] **Step 1: Write failing tests**: `proRataAllocation(12, 2026-07-15, 2026) === 6`, `(12, 2025-03-01, 2026) === 12`, `(15, 2026-12-20, 2026) === 1.5`; `openLeaveYear(2027)` creates balances for 2 employees × 2 paid types, skips the unpaid type, carries `min(remaining, maxDays)` (remaining 7, max 5 → 5), running twice changes nothing; a new employee created via `POST /employees` on 2026-10-01 gets a pro-rated 2026 balance; `resetLeaveBalances` keeps `allocated`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(leave): year rollover with pro-rata and carry-forward; new-joiner allocation`

---

### Task 5: Check-in methods, shift rules, night shift, expense-gate setting

**Files:**
- Modify: `backend/src/controllers/attendance.controller.ts` (`validateMethod`, `checkIn`, `checkOut`, `correctRecord`), `backend/src/lib/attendance-hours.ts` (from Task 2: `resolveShift(employee): Promise<IShift|null>` = `employee.shift ?? Shift.findOne({ isDefault: true })`; `applyShiftRules`), `backend/src/controllers/employees.controller.ts` (`isFieldStaff` already accepted in Task 1)
- Test: `backend/src/controllers/attendance.methods.test.ts`

**Interfaces / rules:**
- `face` → always `400 METHOD_UNAVAILABLE` ("Face verification is not available yet"); it is also removed from `enabledMethods` defaults (existing configs containing it are tolerated).
- `manual` check-in: location enforced when `cfg.settings.requireLocation || employee.requireLocation` (the commented-out rule is restored through `assertLocationIfRequired`, which is now called in `checkIn` too).
- `ip` → uses `req.ip` (trust-proxy aware), not the raw first XFF entry.
- Check-out: method re-validation is **skipped** (mobile hard-codes `manual`); only the location rule applies. Check-out looks up the latest row with `checkIn.time` set and no `checkOut.time` whose `checkIn.time ≥ now − 36h` (so a night-shift punch-out after midnight closes yesterday's row); if none → "You must check in first".
- `applyShiftRules(att, shift, cfg)`: `lateBy = max(0, checkIn − (shift.startTime + shift.graceMinutes))` in minutes on the row's IST day (fallback: config `lateMarkAfterMinutes` relative to the first punch when no shift); status `late` when `lateBy > 0` and the row has no leave stamp; `earlyLeaveBy = max(0, shift.endTime − checkOut)` (0 without a shift); half-day when `totalWorkingHours < (shift?.halfDayHours ?? cfg.halfDayThresholdHours)`; overtime threshold `shift ? shift.fullDayHours*60 : cfg.overtimeThresholdMinutes`; night shift: `endTime < startTime` means the end is on the next day.
- Expense gate: `cfg.settings.expenseBeforeCheckout` — `'all'` (default, current behaviour), `'field'` (only when `employee.isFieldStaff`), `'none'`.

- [ ] **Step 1: Write failing tests**: `face` → 400 `METHOD_UNAVAILABLE`; manual check-in without location when `requireLocation` is on → 400 `LOCATION_REQUIRED`; `ip` method with `X-Forwarded-For: 10.0.0.5` (trusted proxy) matches an allowed IP `10.0.0.5`; night shift (shift 22:00–06:00): check-in at 22:30 IST, check-out at 06:10 IST next day → the **same** row is closed, `totalWorkingHours ≈ 7.67`, `earlyLeaveBy === 0`; shift 09:30 with grace 15 and check-in 09:50 → `lateBy === 5`, status `late`; check-out at 17:00 with `endTime 18:00` → `earlyLeaveBy === 60`; `expenseBeforeCheckout: 'field'` with a non-field employee → check-out succeeds without an expense; `'all'` → `EXPENSE_REQUIRED_FOR_CHECKOUT`; `'none'` → succeeds.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `fix(attendance): real method enforcement, shift-based late/early/half-day, night-shift check-out, configurable expense gate`

---

### Task 6: Regularization with requested times, approval queue, notifications

**Files:**
- Modify: `backend/src/controllers/attendance.controller.ts` (`regularizeSchema` adds `checkIn?: coerce.date`, `checkOut?: coerce.date`; `requestRegularization`; `decideRegularization`; new `listRegularizations`), `backend/src/routes/attendance.routes.ts` (`GET /regularizations` → `attendance.approve`), `backend/src/services/notification.service.ts` (`notifyRegularization(managerUserId, …)`, `notifyRegularizationDecision(employeeUserId, …)`)
- Test: `backend/src/controllers/attendance.regularization.test.ts`

**Rules:** future dates → 400; a pending request already on the row → 409 `REGULARIZATION_PENDING`; requested times must be on the row's day (check-out may be ≤ 12 h after check-in, crossing midnight allowed); on approve: set `checkIn`/`checkOut` from the requested times (method `manual`, `metadata.regularized: true`, `source: 'regularization'`), recompute hours via `computeHours` + `applyShiftRules`, status `present`/`late` accordingly (an `absent` auto row becomes present); on reject: row unchanged except the regularization status; notify manager on request, employee on decision. `GET /attendance/regularizations?status=pending&page&limit` returns rows with `regularization.status` matching, populated with `employeeId (firstName lastName employeeId department)`.

- [ ] **Step 1: Write failing tests**: request with times → stored `requestedCheckIn/Out`; future date → 400; second request while pending → 409; approve → `checkIn.time` equals the requested time, `totalWorkingHours` computed, status `present`; reject → status stays `absent`; list as `hr_executive` → contains the pending row; employee → 403; notifications created for manager and employee.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(attendance): regularization with requested times, approval queue, notifications`

---

### Task 7: Payroll cycle state machine, manual adjustments, record integrity, visibility

**Files:**
- Modify: `backend/src/controllers/payroll.controller.ts` (`processCycle`, `updateRecord`, `lockCycle`, `markCyclePaid`, `listCycleRecords`, `myPayslips`, `downloadPayslip`, `getRecordPayslip`, `statutoryReport`), `backend/src/services/payslip-pdf.service.ts` (render arrears/reimbursements/loan/TDS/advance/expense/late-deduction lines from the record so totals match), `backend/src/lib/payroll-cycle.ts` (create: `assertTransition(cycle, action)`, `recomputeCycleTotals(cycleId)`)
- Test: `backend/src/controllers/payroll.cycle.test.ts`

**Rules:**
- `process`: allowed when status ∈ {`draft`,`processed`}; else 409 `CYCLE_NOT_EDITABLE`. Before deleting old records, read each record's `manualAdjustments` into a map by employee and re-apply them after recompute (Task 8 does the maths; until then, copy the numeric fields and re-add their lines).
- `updateRecord`: 404 unless `record.cycleId.equals(cycle._id)`; 409 unless cycle status ∈ {`draft`,`processed`}; writes only `manualAdjustments.*` (+ `note`), then recomputes the record's totals and `recomputeCycleTotals`.
- `lock`: only from `processed` (sets `lockedAt/lockedBy`); `markPaid`: only from `locked` (sets `paidAt/paidBy`, `paymentStatus: 'paid'` on all records) and then calls Task 8's `settleCycle(cycle)` (loans/claims) — stub a no-op export `settleCycle` in `services/payroll-settlement.service.ts` now so Task 8 fills it.
- Employees (`myPayslips`, `/my-payslips/:id`, payslip download for non-privileged callers): only cycles with status `locked` or `paid`.
- `statutoryReport` sums lines by `statutoryType` (`pf`, `esi`, `pt`, `tds`), not by name; lines produced by Task 8 carry `statutoryType`; legacy records without it fall back to the old name match.
- Privilege checks use `hasPermission(user, 'payroll.process')` instead of role slugs.

- [ ] **Step 1: Write failing tests**: process a `paid` cycle → 409; re-process a `processed` cycle after `PATCH records/:id { arrears: 500 }` → the new record still has `arrears === 500` and the line; `PATCH /cycles/<other>/records/<id>` → 404; lock from `draft` → 409; mark paid from `processed` → 409; `myPayslips` for an employee hides a `processed` cycle and shows a `locked` one; after a record edit `cycle.totalNet` equals the sum of records; statutory report from a record whose PF line carries `statutoryType: 'pf'` → `pf` total correct, and a legacy line named `ESI Employee` without the type is still counted under `esi`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `fix(payroll): cycle state machine, manual adjustments survive re-process, record integrity, employee visibility`

---

### Task 8: Payroll computation service (window pro-rata, LOP from rows, structures, loans, claims, TDS)

**Files:**
- Create: `backend/src/services/payroll-compute.service.ts`, `backend/src/services/payroll-compute.service.test.ts`, `backend/src/services/payroll-settlement.service.ts` (fill the Task 7 stub)
- Modify: `backend/src/controllers/payroll.controller.ts` (`computeForEmployee` becomes a thin call; `processCycle` employee selection; `assignStructure` persists `employee.salaryStructureId`), `backend/src/controllers/expense-claims.controller.ts` (`reimburseClaim` stays manual; add `payrollCycleId` + `reimbursedAt` on settle)

**Interfaces:**
- `paidWindow(employee, year, month): { start: Date; end: Date; calendarDays: number; monthDays: number } | null` — `start = max(joiningDate, periodStart)`, `end = min(exitDate ?? periodEnd, periodEnd)`; `null` when the window is empty (joined after the period or exited before it). Employees with status `resigned`/`terminated` are included iff `exitDate` ∈ period.
- `dayTally(employeeId, window): Promise<{ present, late, halfDay, paidLeave, unpaidLeave, absent, weeklyOff, lopDays }>` from attendance rows in the window: `lopDays = absent rows (incl. unpaid-leave rows) + 0.5 × half_day rows where isPaidLeave !== true`; rows with `isPaidLeave === true` never add LOP; approved unpaid `LeaveRequest` days inside the window with **no** row are added (dedupe by date).
- `earningsFor(employee, basisDaysPaid, monthDays): IPayrollLine[]` — if `salaryStructureId` populated: for each structure component with its `SalaryComponent` (`type` earning/deduction/employer, `calculationType`): `fixed` → `value`; `percentage_of_basic` → `value% × basic`; `percentage_of_gross` → `value% × employee.salary.grossSalary`; pro-rated by `daysPaid/monthDays` when the component is an earning; else legacy `basic/hra/da/specialAllowance` lines as today.
- `computeRecord(employee, cycle, cfg, opts: { manual?: ManualAdjustments }): Promise<ComputedRecord>` — `daysPaid = windowCalendarDays − lopDays`; statutory via Task 9 (`pf` on earned basic+DA, `esi` per eligibility, `pt` by state/month/gender, `tds = manual.tds ?? employee.salary.tdsMonthly`); `loanDeduction = manual.loanDeduction ?? sum(installments of active loans with status pending and dueDate ∈ period)`; `reimbursements = manual.reimbursements ?? sum(acceptedAmount ?? amount of claims status 'approved' for the employee not yet reimbursed)`; `arrears/advance/expense` from manual; every statutory line carries `statutoryType`.
- `settleCycle(cycle): Promise<{ installmentsPaid: number; claimsReimbursed: number }>` — for each record of a `paid` cycle: mark the counted installments `paid` (`paidAmount = amount`, update loan `totalPaid/outstanding*`, close when done) and the counted claims `reimbursed` with `reimbursedAt`, `payrollCycleId`. Idempotent (skips already-settled).

- [ ] **Step 1: Write failing tests** (fixtures with explicit salaries; assert exact rupees): joiner on the 20th of a 30-day month, no rows → `daysPaid 11`, basic 30000 → Basic line `11000`; leaver exit on the 10th → `daysPaid 10`; employee exited last month → not in the cycle; full month with 2 `absent` auto rows and 1 unpaid-leave row → `lopDays 3`, `daysPaid 27`; a punched day that also carries `isPaidLeave: true` → counted once as paid (`counts a punched paid-leave day once`); structure-based: basic 20000 + HRA 40% of basic + fixed 2000 → lines `20000/8000/2000`; loan with an installment due in the period → `loanDeduction` line equals the installment and `settleCycle` marks it paid once; two approved claims (1500 + 500 accepted 400) → reimbursements `1900` and both become `reimbursed`; `tdsMonthly 1200` → TDS line `1200` with `statutoryType 'tds'`; re-process after settlement does not double-settle.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement**, deleting the old inline maths from the controller.
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(payroll): compute service with pro-rata window, LOP from attendance rows, structures, loan EMI and reimbursement settlement, TDS line`

---

### Task 9: Statutory rules module (PF on earned wages, ESI eligibility per period, PT slabs by state)

**Files:**
- Create: `backend/src/lib/statutory.ts`, `backend/src/lib/statutory.test.ts`, `backend/src/config/professional-tax.ts`
- Modify: `backend/src/config/env.ts` (`PF_WAGE_CEILING: coerce.number default 15000`, `PF_RATE_PERCENT: default 12`, `ESI_WAGE_CEILING: default 21000`, `ESI_EMPLOYEE_PERCENT: default 0.75`, `ESI_EMPLOYER_PERCENT: default 3.25`), `backend/.env.example`, `backend/src/services/payroll-compute.service.ts` (use these), `backend/src/models/employee.model.ts` (`statutory` fields from Task 1 are written here)

**Interfaces:**
- `pfEmployee(earnedBasicPlusDa: number, cfg = env): number` = `round2(min(earned, ceiling) × rate)`; `pfEmployer` same.
- `esiPeriodKey(date: Date): string` → `'YYYY-H1'` for Apr–Sep, `'YYYY-H2'` for Oct–Mar (year of April).
- `esiEligibility(employee, fullMonthGross, periodKey, cfg): { eligible: boolean; persist: boolean }` — if `employee.statutory.esiPeriodKey === periodKey` → reuse `employee.statutory.esiEligible`; else decide `fullMonthGross ≤ ceiling` and return `persist: true` (the caller saves `statutory`).
- `esiEmployee(earnedGross, eligible)` = `eligible ? Math.ceil(earnedGross × 0.0075) : 0` (rounded **up** to the rupee); `esiEmployer(earnedGross, eligible)` = `round2(earnedGross × 0.0325)`.
- `professionalTax({ stateCode, monthlyGross, month, gender })` from `config/professional-tax.ts`: tables for `MH` (≤7500: 0; 7501–10000: 175; >10000: 200, Feb 300; women with gross ≤ 25000: 0), `GJ` (≤12000: 0; >12000: 200), `KA` (≤24999: 0 — ≥25000: 200), `TN` (half-yearly slabs expressed monthly: ≤3500: 0; 3501–5000: 22.5; 5001–7500: 52.5; 7501–10000: 115; 10001–12500: 171; >12500: 208), `WB` (≤10000: 0; 10001–15000: 110; 15001–25000: 130; 25001–40000: 150; >40000: 200), `AP`/`TS` (≤15000: 0; 15001–20000: 150; >20000: 200); unknown state → 0.

- [ ] **Step 1: Write failing tests** with exact values: `pfEmployee(19434)` → `1800`; `pfEmployee(12000)` → `1440`; `esiPeriodKey(2026-10-05)` → `'2026-H2'`, `(2027-02-01)` → `'2026-H2'`, `(2026-05-01)` → `'2026-H1'`; eligibility persisted in `2026-H2` stays eligible for a later month in the same period even if gross rises to 30000; `esiEmployee(20500, true)` → `154` (153.75 rounded up); `professionalTax({MH, 30000, 2, 'male'})` → `300`; `({MH, 30000, 5, 'female'})` → `200`; `({MH, 20000, 5, 'female'})` → `0`; `({GJ, 11000})` → `0`; `({GJ, 20000})` → `200`; `({XX, 50000})` → `0`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement** and switch the compute service to it (PF on **earned** basic+DA).
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(payroll): configurable PF/ESI/PT rules with per-period ESI eligibility`

---

### Task 10: Approval chain — managers decide only for direct reports

**Files:**
- Create: `backend/src/lib/approvals.ts`, `backend/src/lib/approvals.test.ts`
- Modify: `backend/src/config/permissions.ts` (add `leaves.approve_all`, `expenses.approve_all`, `overtime.approve_all`), `backend/src/models/role.model.ts` (`hr_executive` and `hr_manager` gain the three `*_all`; `manager` keeps plain `approve`), `backend/src/controllers/leaves.controller.ts` (`approve`/`reject` → `assertCanDecide(req, doc.employeeId, 'leaves')`; `listLeaveRequests`/`leaveCalendar`/`listLeaveBalances` "see all" = `leaves.approve_all || leaves.update`, plain `leaves.approve` sees own + direct reports), `backend/src/controllers/expense-claims.controller.ts` (same with `expenses`; `listClaims` scope), `backend/src/controllers/overtime.controller.ts` (same with `overtime`; `list`/`stats` scope), `backend/src/controllers/attendance.controller.ts` (`decideRegularization`/`listRegularizations`: `attendance.approve` = direct reports, `attendance.manage` = all)
- Test: `backend/src/routes/approval-chain.test.ts`

**Interfaces:**
- `directReportIds(req): Promise<ObjectId[]>` — employees whose `reportingManager` equals the caller's employee id (cached per request).
- `canSeeAll(req, module: 'leaves'|'expenses'|'overtime'|'attendance'): boolean` — `<module>.approve_all` or the module's HR permission (`leaves.update`, `expenses.approve_all` only, `overtime.approve_all` only, `attendance.manage`).
- `assertCanDecide(req, employeeId, module): Promise<void>` — passes when `canSeeAll`, or when the caller holds `<module>.approve` and `employeeId ∈ directReportIds(req)`; else 403 `NOT_YOUR_REPORT`.
- `scopeFilter(req, module, field = 'employeeId'): Promise<Record<string, unknown>>` — `{}` for see-all; `{ [field]: { $in: [...directReports, self] } }` for plain approvers; `{ [field]: self }` otherwise.

- [ ] **Step 1: Write failing tests**: manager M (plain `leaves.approve`) with direct report A and non-report B: approve A's leave → 200; approve B's → 403 `NOT_YOUR_REPORT`; `GET /leaves/requests` for M → only A's (and M's own); `hr_manager` → all; same three for expenses and overtime; `hr_executive` approving a regularization of a non-report → 200 (`attendance.manage`); the permissions static test still passes; seed test: `hr_manager` holds `leaves.approve_all`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(approvals): managers decide only for direct reports; HR gets approve_all`

---

### Task 11: Employee lifecycle (scheduled exit, restore, safe PATCH, import creates logins) and holidays/dashboards

**Files:**
- Modify: `backend/src/controllers/employees.controller.ts` (`updateEmployeeStatus`: a future `exitDate` keeps the employee active and schedules; `updateEmployee`: load → assign → `save()`, sync `User.email`, reject self/cyclic `reportingManager`, deep-merge `salary`; `importEmployees`: create a `User` (`status:'invited'`, `emailVerificationToken`, accept-invite mail) per row like `createEmployee`, keep the Employee ID column when present, return per-row `{ row, status: 'created'|'updated'|'skipped'|'error', message }`; `POST /employees/:id/restore`), `backend/src/routes/employees.routes.ts` (`POST /:id/restore` → `employees.update`), `backend/src/services/day-close.service.ts` (`applyScheduledExits(day)`: employees with `exitDate ≤ day` still `active` → status becomes `exitStatus` stored on the employee (`resigned` default), user deactivated, future approved leaves cancelled via Task 3 `unstampLeaveDays` + balance restore; HR users (`employees.update`) get a notification listing assigned assets / active loans), `backend/src/controllers/holidays.controller.ts` (`POST /rollover { year }` copies `isRecurring` holidays to the target year, skipping duplicates; `importCalendar` dedupes on `(date,name)`), `backend/src/routes/holidays.routes.ts` (`POST /rollover` → `holidays.create`), `backend/src/controllers/dashboard.controller.ts:124` (`'half-day'` → `'half_day'`), `backend/src/services/dashboard.service.ts` (attendance rate = present-ish rows / (active employees × working days so far this month via `classifyDay`); `absentToday` counts `absent` rows), `backend/src/controllers/team.controller.ts` (members with an `on_leave` row show `on_leave`)
- Test: `backend/src/controllers/employees.lifecycle.test.ts`, `backend/src/controllers/holidays.test.ts`

- [ ] **Step 1: Write failing tests**: status change with `exitDate` next week → employee stays `active` and user stays active; `applyScheduledExits(dayAfterExit)` → status `resigned`, user `inactive`, a future approved leave becomes `cancelled` and its balance restored; `POST /employees/:id/restore` on a soft-deleted employee → 200 and listed again; PATCH with `salary: { hra: 1 }` keeps `basic`; PATCH email → `User.email` updated; PATCH `reportingManager = self` → 400; import of 2 rows → 2 employees, 2 invited users, 2 mails captured, per-row report; holiday rollover 2026→2027 copies the recurring one and not the other; dashboard trend counts a `half_day` row under half-day; attendance rate for 10 active employees, 2 working days, 15 present rows → `0.75`.
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(employees): scheduled exits, restore, safe updates, import creates logins; holidays rollover; dashboard fixes`

---

### Task 12: Decision notifications and e-mails (expenses, overtime, payroll lock)

**Files:**
- Modify: `backend/src/services/notification.service.ts` (`notifyDecision(userId, { module: 'expense'|'overtime'|'leave'|'regularization', status, title, link })`, `notifyPayslipReady(userId, { month, year })`), `backend/src/controllers/expense-claims.controller.ts` (create → manager notification via `notifyExpenseRequest`; approve/reject/reimburse → employee `notifyDecision` + `sendMail`), `backend/src/controllers/overtime.controller.ts` (create → manager; approve/reject → employee), `backend/src/controllers/payroll.controller.ts` (`lockCycle` → `notifyPayslipReady` for every record's employee user), `backend/src/services/email-templates.ts` (small `decisionEmail({ title, body, link })` and `payslipReadyEmail`; the SaaS trial/invoice templates are **deleted**)
- Test: `backend/src/services/notifications.decisions.test.ts`

- [ ] **Step 1: Write failing tests**: expense claim created by A whose `reportingManager` is M → notification for M's user; approve → notification for A's user and `sendMail` called with A's email; overtime reject → notification; `lockCycle` → one `payslip_ready` notification per employee with a user; deleted templates have no importers (`grep` in the test via `fs` is acceptable, or just type-check).
- [ ] **Step 2: Run to verify they fail.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run suite + type-check.**
- [ ] **Step 5: Commit** — `feat(notifications): decisions and payslip-ready notifications and e-mails; remove SaaS mail templates`

---

### Task 13: Frontend for Phase 2

**Files:**
- Create: `frontend/src/pages/attendance/RegularizationsPage.tsx`, `frontend/src/components/payroll/RecordAdjustmentsDialog.tsx`
- Modify: `frontend/src/config/navigation.ts` + `src/router/index.tsx` (Attendance → "Regularizations" for `attendance.approve`; Leaves → "Open year" button lives on Leave Balances page), `frontend/src/pages/attendance/AttendanceConfigPage.tsx` (select "Expense before check-out: all / field staff only / none"; `autoCheckoutTime` time input; remove "Face Recognition" from the method list), `frontend/src/pages/employees/EmployeeFormPage.tsx` (+ `isFieldStaff` toggle, `salary.tdsMonthly`, salary-structure select, `exitDate` + exit status on the status dialog), `frontend/src/pages/employees/EmployeeDetailPage.tsx` (wire the "Deactivate" button to the status dialog — it was dead), `frontend/src/pages/payroll/PayrollCycleDetailPage.tsx` + `PayrollDashboardPage.tsx` (status-aware actions: Process only in `draft`/`processed`, Lock only in `processed`, Mark paid only in `locked`; "Edit adjustments" opens the dialog with arrears/advance/expense/reimbursements/loan/TDS/note and shows the cycle status chip), `frontend/src/pages/leaves/LeaveTypesPage.tsx` (fields `probationAllowed`, `applicableGender`, `attachmentRequired`, `halfDayAllowed`, `isActive` if missing), `frontend/src/pages/leaves/LeaveBalancePage.tsx` ("Open year" button → `POST /leaves/balances/open-year`), `frontend/src/pages/holidays/HolidayListPage.tsx` (type + departments in the form; "Copy recurring to next year" button; year switch), `frontend/src/pages/leaves/MyLeavesPage.tsx` (cancel disabled for started leaves; HR cancel asks a reason), `frontend/src/lib/*.api.ts` + hooks for the new endpoints, `frontend/src/lib/permissions.ts` (nothing — names come from the catalogue), `frontend/src/pages/settings/RolesPage.tsx` (no change; new names appear automatically)
- Test: `frontend/src/pages/payroll/cycle-actions.test.tsx` (status → enabled buttons), `frontend/src/pages/attendance/RegularizationsPage.test.tsx` (renders rows, approve calls the API)

- [ ] **Step 1: Write the two failing tests.**
- [ ] **Step 2: Implement.**
- [ ] **Step 3: `npm run type-check` → 0; `npx vitest run` → PASS; `npm run build` → OK (do not commit dist here).**
- [ ] **Step 4: Commit** — `feat(web): regularization approvals, payroll state-aware actions and adjustments, leave/holiday/attendance settings for phase 2`

---

### Task 14: Rebuild dist, checklist additions, smoke test

**Files:**
- Modify: `docs/deploy-checklist.md` (new section "Phase 2": new env keys `PF_WAGE_CEILING`, `PF_RATE_PERCENT`, `ESI_WAGE_CEILING`, `ESI_EMPLOYEE_PERCENT`, `ESI_EMPLOYER_PERCENT`, `COMPANY_STATE_CODE` (must be set — `GJ`/`MH`/…), `TIMEZONE=Asia/Kolkata`; the nightly jobs start automatically and need Redis; run `node dist/scripts/seed.js` (new permissions on HR roles); one-time `POST /api/v1/leaves/balances/open-year { year: <current> }` from the Leave Balances page; **do not** backfill `close-days` for months already paid; create the holiday unique index `db.holidays.createIndex({date:1,name:1},{unique:true})` only after checking `db.holidays.aggregate([{ $group: { _id: { date: '$date', name: '$name' }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }])` is empty; verification: tomorrow morning `db.attendances.countDocuments({ source: 'auto_absent' })` > 0 on a working day), `README.md` (one line pointing at the Phase 2 section), both `dist/`
- [ ] **Step 1:** `cd backend && npm run type-check && npx vitest run && npm run clean && npm run build`; `cd frontend && npm run type-check && npx vitest run && npm run clean && npm run build`; confirm no `dist/test`, no `.map`, no `sourceMappingURL`.
- [ ] **Step 2:** Smoke test the built backend on scratch Mongo/Redis (as in Phase 1): health 200; `POST /attendance/close-day` as admin on a seeded employee creates an `absent` row; a repeatable job `attendance-day-close` is registered (`node -e` with BullMQ `getRepeatableJobs` against the scratch Redis).
- [ ] **Step 3:** Write the checklist section and commit everything — `build: rebuild dist for phase 2; deploy checklist additions`.
