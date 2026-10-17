/**
 * Day-close — what happens to attendance when a business day ends.
 *
 * Without it nobody is ever marked absent and a forgotten check-out stays
 * open forever, so payroll (which only deducts `absent` rows) paid every
 * no-show in full. For one business day this:
 *
 *   1. writes the row every in-scope employee is missing on a working day:
 *        • approved leave covering the day → the leave row (`source: 'leave'`);
 *        • otherwise → `absent` (`source: 'auto_absent'`).
 *      In scope = `status: 'active'`, joined on or before the day, and no
 *      exit date before it. A day the classifier calls `weekend` or
 *      `holiday` for that employee writes nothing. Existing rows are never
 *      touched.
 *   2. closes every check-in of that day that has no check-out, at the
 *      configured `autoCheckoutTime` (23:59 when unset), and recomputes the
 *      hours with the same rules a real check-out uses.
 *
 * Idempotent: a second run for the same day finds every row already there
 * and every check-in already closed, and returns all-zero counts.
 *
 * Run nightly at 23:59 business time by `jobs/attendance.jobs.ts`, and for
 * past days by `POST /attendance/close-day` and `/close-days`.
 */
import type { Types } from 'mongoose';
import { Attendance, type IAttendance, type ICheckinRecord } from '../models/attendance.model.js';
import { AttendanceConfig, type IAttendanceConfig } from '../models/attendance-config.model.js';
import { Employee } from '../models/employee.model.js';
import { LeaveRequest, type ILeaveRequest } from '../models/leave-request.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import type { IShift } from '../models/shift.model.js';
import { classifyDay, listHolidaysBetween } from '../lib/day-classifier.js';
import { DEFAULT_WORK_DAYS } from '../lib/week-off.js';
import { atBusinessTime, endOfBusinessDay, startOfBusinessDay } from '../lib/business-day.js';
import { applyShiftRules, computeHours } from '../lib/attendance-hours.js';
import { getWeekOffRule } from './week-off.service.js';

export interface DayCloseCounts {
  /** `absent` rows written for working days with no row. */
  absentCreated: number;
  /** Leave rows written for days an approved leave covers. */
  leaveStamped: number;
  /** Open check-ins closed at the auto-checkout time. */
  autoCheckedOut: number;
  /**
   * Nothing written although the employee/row was in scope: a non-working
   * day for them, a soft-deleted row already holding the day, a check-in
   * that raced the job, or an auto-checkout time that has not arrived yet.
   */
  skipped: number;
}

/** Check-out time used when `settings.autoCheckoutTime` is unset or invalid. */
export const DEFAULT_AUTO_CHECKOUT_TIME = '23:59';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A Date whose *server-local* calendar date is the label's date (local noon),
 * for `classifyDay` / `listHolidaysBetween`, which read local `getDay()` and
 * `getDate()`. Noon keeps it on the right date whatever the server timezone.
 */
function localDateOf(dayLabel: Date): Date {
  return new Date(dayLabel.getUTCFullYear(), dayLabel.getUTCMonth(), dayLabel.getUTCDate(), 12);
}

/** The business day a stored date (joining, exit, leave start/end) falls on. */
const dayOf = (d: Date): number => startOfBusinessDay(d).getTime();

const isDuplicateKey = (err: unknown): boolean =>
  (err as { code?: number } | null)?.code === 11000;

/**
 * Insert rows, ignoring any that lose a race to a row written meanwhile (a
 * check-in landing between our read and our write). Returns how many were
 * actually inserted.
 */
async function insertIgnoringDuplicates(docs: Record<string, unknown>[]): Promise<number> {
  if (docs.length === 0) return 0;
  try {
    await Attendance.insertMany(docs, { ordered: false });
    return docs.length;
  } catch (err) {
    const e = err as {
      writeErrors?: { code?: number; err?: { code?: number } }[];
      insertedDocs?: unknown[];
      result?: { insertedCount?: number };
    };
    const writeErrors = e.writeErrors ?? [];
    const onlyDuplicates =
      writeErrors.length > 0 && writeErrors.every((w) => (w.err?.code ?? w.code) === 11000);
    if (!onlyDuplicates) throw err;
    return e.insertedDocs?.length ?? e.result?.insertedCount ?? docs.length - writeErrors.length;
  }
}

/**
 * Write the attendance row an approved leave produces for one working day:
 * paid → `on_leave`, unpaid → `absent`, half-day → `half_day`. Returns
 * whether a row was written (false when one already holds the day).
 *
 * Stand-in for the leave-attendance service's stamping; replace this one
 * call when leave approval writes its rows itself.
 */
async function stampApprovedLeaveDay(
  employeeId: Types.ObjectId,
  day: Date,
  request: ILeaveRequest,
  leaveType: ILeaveType | null,
  dryRun: boolean,
): Promise<boolean> {
  const paid = leaveType?.paidLeave !== false;
  if (dryRun) return true;
  try {
    await Attendance.create({
      employeeId,
      date: day,
      status: request.isHalfDay ? 'half_day' : paid ? 'on_leave' : 'absent',
      isPaidLeave: paid,
      leaveRequestId: request._id,
      source: 'leave',
    });
    return true;
  } catch (err) {
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/**
 * Where an open check-in is closed: the configured auto-checkout time on that
 * day — or 23:59 when the employee only checked in after it — never before
 * the check-in itself.
 */
function autoCheckoutInstant(day: Date, checkIn: Date, autoCheckoutTime: string): Date {
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
export async function closeBusinessDay(
  dateIST: Date,
  opts: { dryRun?: boolean } = {},
): Promise<DayCloseCounts> {
  const dryRun = opts.dryRun === true;
  const now = new Date();
  const day = startOfBusinessDay(dateIST);
  if (day.getTime() > startOfBusinessDay(now).getTime()) {
    throw new RangeError(`closeBusinessDay: ${day.toISOString().slice(0, 10)} has not started yet`);
  }
  const dayEnd = endOfBusinessDay(day);
  const localDay = localDateOf(day);
  const counts: DayCloseCounts = { absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 };

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
    status: 'active',
    joiningDate: { $lt: new Date(day.getTime() + DAY_MS) },
    $or: [{ exitDate: null }, { exitDate: { $gte: new Date(day.getTime() - DAY_MS) } }],
  })
    .select('_id department shift joiningDate exitDate')
    .populate('shift')
    .exec();
  const inScope = candidates.filter(
    (e) =>
      dayOf(e.joiningDate) <= day.getTime() && (!e.exitDate || dayOf(e.exitDate) >= day.getTime()),
  );
  const shiftOf = (e: (typeof candidates)[number]): IShift | null =>
    (e.shift as unknown as IShift | null | undefined) ?? null;

  const ids = inScope.map((e) => e._id as Types.ObjectId);
  // Soft-deleted rows count: the unique (employeeId, date) index still holds them.
  const existing = await Attendance.find({ employeeId: { $in: ids }, date: { $gte: day, $lte: dayEnd } })
    .setOptions({ withDeleted: true })
    .select('employeeId isDeleted')
    .lean<{ employeeId: Types.ObjectId; isDeleted?: boolean }[]>()
    .exec();
  const rowState = new Map(existing.map((r) => [String(r.employeeId), r.isDeleted ? 'deleted' : 'live']));

  const leaves = await LeaveRequest.find({
    employeeId: { $in: ids },
    status: 'approved',
    startDate: { $lt: new Date(day.getTime() + DAY_MS) },
    endDate: { $gte: new Date(day.getTime() - DAY_MS) },
  }).exec();
  const leaveByEmployee = new Map<string, ILeaveRequest>();
  for (const lr of leaves) {
    if (dayOf(lr.startDate) <= day.getTime() && dayOf(lr.endDate) >= day.getTime()) {
      leaveByEmployee.set(String(lr.employeeId), lr);
    }
  }
  const leaveTypes = new Map<string, ILeaveType>();
  if (leaveByEmployee.size > 0) {
    const typeIds = [...leaveByEmployee.values()].map((lr) => lr.leaveTypeId);
    // A since-deleted leave type still decides whether its leave was paid.
    const types = await LeaveType.find({ _id: { $in: typeIds } }).setOptions({ withDeleted: true }).exec();
    for (const t of types) leaveTypes.set(String(t._id), t);
  }

  const absentRows: Record<string, unknown>[] = [];
  for (const emp of inScope) {
    const key = String(emp._id);
    const kind = classifyDay(localDay, {
      workDays: shiftOf(emp)?.workDays ?? DEFAULT_WORK_DAYS,
      weekOffRule,
      holidays,
      departmentId: emp.department ?? null,
    });
    if (kind !== 'working') {
      counts.skipped += 1;
      continue;
    }
    const state = rowState.get(key);
    if (state === 'live') continue;
    if (state === 'deleted') {
      counts.skipped += 1;
      continue;
    }

    const leave = leaveByEmployee.get(key);
    if (leave) {
      const type = leaveTypes.get(String(leave.leaveTypeId)) ?? null;
      // eslint-disable-next-line no-await-in-loop
      if (await stampApprovedLeaveDay(emp._id as Types.ObjectId, day, leave, type, dryRun)) {
        counts.leaveStamped += 1;
      } else {
        counts.skipped += 1;
      }
      continue;
    }
    absentRows.push({ employeeId: emp._id, date: day, status: 'absent', source: 'auto_absent' });
  }

  const inserted = dryRun ? absentRows.length : await insertIgnoringDuplicates(absentRows);
  counts.absentCreated += inserted;
  counts.skipped += absentRows.length - inserted;

  // ── 2. Close check-ins left open ───────────────────────────────────────
  const openRows = await Attendance.find({
    date: { $gte: day, $lte: dayEnd },
    'checkIn.time': { $ne: null },
    'checkOut.time': null,
  }).exec();
  if (openRows.length === 0) return counts;

  const autoCheckoutTime = HHMM.test(cfg?.settings.autoCheckoutTime ?? '')
    ? cfg!.settings.autoCheckoutTime!
    : DEFAULT_AUTO_CHECKOUT_TIME;
  const owners = await Employee.find({ _id: { $in: openRows.map((r) => r.employeeId) } })
    .setOptions({ withDeleted: true })
    .select('_id shift')
    .populate('shift')
    .exec();
  const ownerShift = new Map(owners.map((e) => [String(e._id), shiftOf(e)]));

  for (const row of openRows) {
    const out = autoCheckoutInstant(day, row.checkIn!.time!, autoCheckoutTime);
    if (out.getTime() > now.getTime()) {
      // The day is still running (a run before 23:59); leave it open.
      counts.skipped += 1;
      continue;
    }
    counts.autoCheckedOut += 1;
    if (dryRun) continue;
    closeOpenRow(row, out, ownerShift.get(String(row.employeeId)) ?? null, cfg);
    // eslint-disable-next-line no-await-in-loop
    await row.save();
  }

  return counts;
}

/** Stamp the auto check-out on `row` and recompute its hours (in memory). */
function closeOpenRow(
  row: IAttendance,
  out: Date,
  shift: IShift | null,
  cfg: IAttendanceConfig | null,
): void {
  // A break still open at check-out ends there, so it is deducted rather
  // than left dangling.
  for (const b of row.breaks) {
    if (b.startTime && !b.endTime) {
      b.endTime = out < b.startTime ? b.startTime : out;
      b.duration = Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60_000);
    }
  }
  row.checkOut = { time: out, method: 'manual', metadata: { autoCheckout: true } } as ICheckinRecord;
  row.source = 'auto_checkout';
  row.totalWorkingHours = computeHours(row, out);
  applyShiftRules(row, shift, cfg);
}
