import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee } from '../models/employee.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { Shift } from '../models/shift.model.js';
import { classifyDay, listHolidaysBetween } from '../lib/day-classifier.js';
import { DEFAULT_WORK_DAYS } from '../lib/week-off.js';
import { atBusinessTime, DAY_MS, endOfBusinessDay, localDateOf, startOfBusinessDay } from '../lib/business-day.js';
import { applyShiftRules, computeHours, isOvernightShift, resolveShift, shiftWindow, } from '../lib/attendance-hours.js';
import { logger } from '../config/logger.js';
import { getWeekOffRule } from './week-off.service.js';
import { stampLeaveDay } from './leave-attendance.service.js';
import { EXIT_STATUSES, hrRecipients, notifyHrOfExit, releaseOnExit } from './employee-exit.service.js';
/**
 * Some rows of the day could not be written. `counts` is what did succeed;
 * `failures` names each row that did not (the causes are in `errors`).
 */
export class DayCloseError extends AggregateError {
    day;
    counts;
    failures;
    constructor(day, counts, failures, causes) {
        const which = failures
            .map((f) => `${f.step} ${f.attendanceId ? `attendance ${f.attendanceId}` : `employee ${f.employeeId}`}`)
            .join(', ');
        const done = Object.entries(counts)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ');
        super(causes, `day-close ${day}: ${failures.length} failure(s) — ${which}; succeeded: ${done}`);
        this.day = day;
        this.counts = counts;
        this.failures = failures;
        this.name = 'DayCloseError';
    }
}
/** Check-out time used when `settings.autoCheckoutTime` is unset or invalid. */
export const DEFAULT_AUTO_CHECKOUT_TIME = '23:59';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** The business day a stored date (joining, exit, leave start/end) falls on. */
const dayOf = (d) => startOfBusinessDay(d).getTime();
/**
 * Insert rows, ignoring any that lose a race to a row written meanwhile (a
 * check-in landing between our read and our write). Returns how many were
 * actually inserted.
 */
async function insertIgnoringDuplicates(docs) {
    if (docs.length === 0)
        return 0;
    try {
        await Attendance.insertMany(docs, { ordered: false });
        return docs.length;
    }
    catch (err) {
        const e = err;
        const writeErrors = e.writeErrors ?? [];
        const onlyDuplicates = writeErrors.length > 0 && writeErrors.every((w) => (w.err?.code ?? w.code) === 11000);
        if (!onlyDuplicates)
            throw err;
        return e.insertedDocs?.length ?? e.result?.insertedCount ?? docs.length - writeErrors.length;
    }
}
/**
 * Where an open check-in is closed: the configured auto-checkout time on that
 * day — or 23:59 when the employee only checked in after it — never before
 * the check-in itself.
 */
function autoCheckoutInstant(day, checkIn, autoCheckoutTime) {
    const configured = atBusinessTime(day, autoCheckoutTime);
    const out = configured.getTime() > checkIn.getTime()
        ? configured
        : atBusinessTime(day, DEFAULT_AUTO_CHECKOUT_TIME);
    return out.getTime() >= checkIn.getTime() ? out : checkIn;
}
/**
 * Close the business day containing `dateIST` (any instant; it is resolved to
 * its calendar day in the business timezone). With `dryRun`, returns the
 * counts it would produce without writing anything.
 */
export async function closeBusinessDay(dateIST, opts = {}) {
    const dryRun = opts.dryRun === true;
    const now = new Date();
    const day = startOfBusinessDay(dateIST);
    if (day.getTime() > startOfBusinessDay(now).getTime()) {
        throw new RangeError(`closeBusinessDay: ${day.toISOString().slice(0, 10)} has not started yet`);
    }
    const dayEnd = endOfBusinessDay(day);
    const localDay = localDateOf(day);
    const counts = { absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 };
    const failures = [];
    const causes = [];
    const [cfg, weekOffRule, holidays] = await Promise.all([
        AttendanceConfig.findOne({}).exec(),
        getWeekOffRule(),
        listHolidaysBetween(localDay, localDay),
    ]);
    // ── 1. Rows for employees with nothing on the day ──────────────────────
    // The date filters are a coarse ±1 day pre-filter; the exact business-day
    // comparison happens below so date-only values stored at UTC or IST
    // midnight are both read as the day they name.
    const candidates = await Employee.find({
        joiningDate: { $lt: new Date(day.getTime() + DAY_MS) },
        $or: [
            // Still employed — `onNotice` included: payroll pays the notice period,
            // so a notice-period no-show must be docked like anyone else's.
            {
                status: { $in: ['active', 'onNotice'] },
                $or: [{ exitDate: null }, { exitDate: { $gte: new Date(day.getTime() - DAY_MS) } }],
            },
            // An exit recorded through the status endpoint or `applyScheduledExits`
            // (`exitStatus` set): employed through the exit date, so closing an
            // earlier day after the exit was applied still covers them.
            {
                status: { $in: [...EXIT_STATUSES] },
                exitStatus: { $in: [...EXIT_STATUSES] },
                exitDate: { $gte: new Date(day.getTime() - DAY_MS) },
            },
        ],
    })
        .select('_id department shift joiningDate exitDate')
        .populate('shift')
        .exec();
    const inScope = candidates.filter((e) => dayOf(e.joiningDate) <= day.getTime() && (!e.exitDate || dayOf(e.exitDate) >= day.getTime()));
    // Work days come from the shift that governs the day — the employee's own,
    // else the company default (`resolveShift`), the same one late marks,
    // half days and auto-checkout use — else Mon–Sat.
    const defaultShift = await Shift.findOne({ isDefault: true }).exec();
    const workDaysOf = new Map(await Promise.all(candidates.map(async (e) => [String(e._id), (await resolveShift(e, { defaultShift }))?.workDays ?? DEFAULT_WORK_DAYS])));
    const ids = inScope.map((e) => e._id);
    // Soft-deleted rows count: the unique (employeeId, date) index still holds them.
    const existing = await Attendance.find({ employeeId: { $in: ids }, date: { $gte: day, $lte: dayEnd } })
        .setOptions({ withDeleted: true })
        .select('employeeId isDeleted')
        .lean()
        .exec();
    const rowState = new Map(existing.map((r) => [String(r.employeeId), r.isDeleted ? 'deleted' : 'live']));
    const leaves = await LeaveRequest.find({
        employeeId: { $in: ids },
        status: 'approved',
        startDate: { $lt: new Date(day.getTime() + DAY_MS) },
        endDate: { $gte: new Date(day.getTime() - DAY_MS) },
    }).exec();
    const leaveByEmployee = new Map();
    for (const lr of leaves) {
        if (dayOf(lr.startDate) <= day.getTime() && dayOf(lr.endDate) >= day.getTime()) {
            leaveByEmployee.set(String(lr.employeeId), lr);
        }
    }
    const leaveTypes = new Map();
    if (leaveByEmployee.size > 0) {
        const typeIds = [...leaveByEmployee.values()].map((lr) => lr.leaveTypeId);
        // A since-deleted leave type still decides whether its leave was paid.
        const types = await LeaveType.find({ _id: { $in: typeIds } }).setOptions({ withDeleted: true }).exec();
        for (const t of types)
            leaveTypes.set(String(t._id), t);
    }
    const absentRows = [];
    for (const emp of inScope) {
        const key = String(emp._id);
        const kind = classifyDay(localDay, {
            workDays: workDaysOf.get(key) ?? DEFAULT_WORK_DAYS,
            weekOffRule,
            holidays,
            departmentId: emp.department ?? null,
        });
        if (kind !== 'working') {
            counts.skipped += 1;
            continue;
        }
        const state = rowState.get(key);
        if (state === 'live')
            continue;
        if (state === 'deleted') {
            counts.skipped += 1;
            continue;
        }
        const leave = leaveByEmployee.get(key);
        if (leave) {
            const type = leaveTypes.get(String(leave.leaveTypeId)) ?? null;
            try {
                // The same stamp leave approval writes; false = a soft-deleted row holds the day.
                // eslint-disable-next-line no-await-in-loop
                if (dryRun || (await stampLeaveDay(leave, type, emp._id, day))) {
                    counts.leaveStamped += 1;
                }
                else {
                    counts.skipped += 1;
                }
            }
            catch (err) {
                logger.error({ employeeId: key, leaveRequestId: String(leave._id), err }, 'day-close: leave stamp failed');
                failures.push({ step: 'leave-stamp', employeeId: key, message: err.message });
                causes.push(err);
            }
            continue;
        }
        absentRows.push({ employeeId: emp._id, date: day, status: 'absent', source: 'auto_absent' });
    }
    const inserted = dryRun ? absentRows.length : await insertIgnoringDuplicates(absentRows);
    counts.absentCreated += inserted;
    counts.skipped += absentRows.length - inserted;
    // ── 2 + 3. Close check-ins left open ───────────────────────────────────
    // The day's own open rows, plus the previous day's: an overnight shift
    // that began then ends on this day.
    const prevDay = new Date(day.getTime() - DAY_MS);
    const openRows = await Attendance.find({
        date: { $gte: prevDay, $lte: dayEnd },
        'checkIn.time': { $ne: null },
        'checkOut.time': null,
    }).exec();
    if (openRows.length > 0) {
        const autoCheckoutTime = HHMM.test(cfg?.settings.autoCheckoutTime ?? '')
            ? cfg.settings.autoCheckoutTime
            : DEFAULT_AUTO_CHECKOUT_TIME;
        const owners = await Employee.find({ _id: { $in: openRows.map((r) => r.employeeId) } })
            .setOptions({ withDeleted: true })
            .select('_id shift')
            .populate('shift')
            .exec();
        // Owners are populated and the default is preloaded: no further queries.
        const ownerShift = new Map(await Promise.all(owners.map(async (e) => [String(e._id), await resolveShift(e, { defaultShift })])));
        for (const row of openRows) {
            const shift = ownerShift.get(String(row.employeeId)) ?? defaultShift;
            const overnight = isOvernightShift(shift);
            let out;
            if (dayOf(row.date) < day.getTime()) {
                // Previous day: only an overnight shift's row is this run's to close.
                if (!overnight)
                    continue;
                // Closed at shift end + grace: the latest an on-time departure would be.
                const window = shiftWindow(startOfBusinessDay(row.date), shift);
                if (!window) {
                    counts.skipped += 1;
                    continue;
                }
                const end = new Date(window.end.getTime() + (shift?.graceMinutes ?? 0) * 60_000);
                out = end.getTime() >= row.checkIn.time.getTime() ? end : row.checkIn.time;
            }
            else {
                if (overnight) {
                    // The shift ends tomorrow: closing a 22:00 check-in at 23:59 would
                    // record under 2 h and a half day. Tomorrow's run sweeps it (3).
                    counts.skipped += 1;
                    continue;
                }
                out = autoCheckoutInstant(day, row.checkIn.time, autoCheckoutTime);
            }
            if (out.getTime() > now.getTime()) {
                // That check-out time has not come yet (a run before it); leave it open.
                counts.skipped += 1;
                continue;
            }
            if (dryRun) {
                counts.autoCheckedOut += 1;
                continue;
            }
            try {
                closeOpenRow(row, out, shift, cfg);
                // eslint-disable-next-line no-await-in-loop
                await row.save();
                counts.autoCheckedOut += 1;
            }
            catch (err) {
                const employeeId = String(row.employeeId);
                const attendanceId = String(row._id);
                logger.error({ employeeId, attendanceId, err }, 'day-close: auto-checkout failed');
                failures.push({ step: 'auto-checkout', employeeId, attendanceId, message: err.message });
                causes.push(err);
            }
        }
    }
    // ── 4. Scheduled exits ─────────────────────────────────────────────────
    const exits = await applyScheduledExits(day, { dryRun });
    counts.exitsApplied = exits.exitsApplied;
    failures.push(...exits.failures);
    causes.push(...exits.causes);
    if (failures.length > 0) {
        throw new DayCloseError(day.toISOString().slice(0, 10), counts, failures, causes);
    }
    return counts;
}
/**
 * Apply every exit whose date has come: each employee still `active` or
 * `onNotice` with an `exitDate` on or before the business day `dateIST`
 * falls on gets the scheduled `exitStatus` (`resigned` when unset). Before
 * the status flips, their approved leave starting after that day is
 * cancelled and refunded and their login deactivated (`releaseOnExit`); once
 * it has flipped, HR is told what to recover (`notifyHrOfExit`).
 *
 * Never throws for one employee: a failure is logged and returned, and that
 * employee keeps their status so the next run retries them (every step is
 * idempotent; the conditional flip means one notice per exit). With
 * `dryRun`, counts the exits it would apply without writing anything.
 * Callers pass a day that has started — `closeBusinessDay` enforces that.
 */
export async function applyScheduledExits(dateIST, opts = {}) {
    const day = startOfBusinessDay(dateIST);
    const result = { exitsApplied: 0, failures: [], causes: [] };
    // Coarse pre-filter (any exit date before the next day); exact below.
    const candidates = await Employee.find({
        status: { $in: ['active', 'onNotice'] },
        exitDate: { $ne: null, $lt: new Date(day.getTime() + DAY_MS) },
    })
        .select('_id firstName lastName employeeId userId exitDate exitStatus')
        .exec();
    const due = candidates.filter((e) => e.exitDate && dayOf(e.exitDate) <= day.getTime());
    if (opts.dryRun === true) {
        result.exitsApplied = due.length;
        return result;
    }
    if (due.length === 0)
        return result;
    const recipients = await hrRecipients();
    for (const emp of due) {
        const status = emp.exitStatus ?? 'resigned';
        try {
            // eslint-disable-next-line no-await-in-loop
            await releaseOnExit(emp, day);
            // eslint-disable-next-line no-await-in-loop
            const flipped = await Employee.findOneAndUpdate({ _id: emp._id, status: { $in: ['active', 'onNotice'] } }, { $set: { status, exitStatus: status } }).exec();
            if (!flipped)
                continue; // changed meanwhile (e.g. HR reactivated them)
            result.exitsApplied += 1;
            // eslint-disable-next-line no-await-in-loop
            await notifyHrOfExit(emp, status, startOfBusinessDay(emp.exitDate), recipients);
        }
        catch (err) {
            const employeeId = String(emp._id);
            logger.error({ employeeId, err }, 'day-close: scheduled exit failed');
            result.failures.push({ step: 'scheduled-exit', employeeId, message: err.message });
            result.causes.push(err);
        }
    }
    return result;
}
/** Stamp the auto check-out on `row` and recompute its hours (in memory). */
function closeOpenRow(row, out, shift, cfg) {
    // A break still open at check-out ends there, so it is deducted rather
    // than left dangling.
    for (const b of row.breaks) {
        if (b.startTime && !b.endTime) {
            b.endTime = out < b.startTime ? b.startTime : out;
            b.duration = Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60_000);
        }
    }
    row.checkOut = { time: out, method: 'manual', metadata: { autoCheckout: true } };
    row.source = 'auto_checkout';
    row.totalWorkingHours = computeHours(row, out);
    applyShiftRules(row, shift, cfg);
    // An assumed check-out time is evidence of neither extra work nor an early
    // departure: no overtime, no early leave.
    row.overtimeHours = 0;
    row.earlyLeaveBy = 0;
}
//# sourceMappingURL=day-close.service.js.map