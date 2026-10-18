/**
 * Leave ↔ attendance, and the leave balance arithmetic.
 *
 * Approved leave used to live only in `LeaveRequest`: nothing wrote an
 * attendance row for it, so payroll (which reads attendance) paid unpaid
 * leave in full and counted no paid leave at all. Approval now stamps one row
 * per working day of the leave — paid → `on_leave`, unpaid → `absent`, a half
 * day → `half_day` — tagged with `leaveRequestId` / `isPaidLeave` /
 * `source: 'leave'`, and cancelling or deleting the request takes them back.
 * The nightly day-close stamps through the same `stampLeaveDay`, so there is
 * one definition of "the row a day of leave produces".
 *
 * "Working day" is `classifyDay`'s verdict for that employee (work days of
 * their shift, else the default shift; company week-off rule, public holidays of their department) — the
 * same verdict day-close uses, and the one an application's `days` is
 * counted with, so the days charged are the days stamped.
 *
 * Days are business-day labels (`startOfBusinessDay`, UTC midnight of the IST
 * calendar date) — the `Attendance.date` convention — so a leave date stored
 * at UTC or IST midnight lands on the day it names.
 *
 * Balance updates are single atomic statements (the standalone Mongo used in
 * tests has no multi-document transactions): approval charges `used` only if
 * the remaining balance still covers the request, in the same write.
 */
import { Types } from 'mongoose';
import { Attendance, type AttendanceStatus } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveRequest, type ILeaveRequest } from '../models/leave-request.model.js';
import type { ILeaveType } from '../models/leave-type.model.js';
import { Shift } from '../models/shift.model.js';
import { classifyDay, listHolidaysBetween } from '../lib/day-classifier.js';
import { DEFAULT_WORK_DAYS } from '../lib/week-off.js';
import { applyShiftRules, computeHours, resolveShift } from '../lib/attendance-hours.js';
import {
  businessDayLabels,
  endOfBusinessDay,
  localDateOf,
  startOfBusinessDay,
} from '../lib/business-day.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey, proRataAllocation } from '../lib/leave-allocation.js';
import { logger } from '../config/logger.js';
import { getWeekOffRule } from './week-off.service.js';

// ---------- Leave types ----------

/**
 * Unpaid leave: `paidLeave: false`, or a type whose code/name says so (LWP,
 * LOP, "unpaid", "loss of pay") even if the flag was never cleared.
 */
export function isUnpaidLeaveType(
  leaveType?: { paidLeave?: boolean; code?: string; name?: string } | null,
): boolean {
  if (!leaveType) return false;
  if (leaveType.paidLeave === false) return true;
  const code = (leaveType.code ?? '').toUpperCase();
  const name = (leaveType.name ?? '').toLowerCase();
  if (['LWP', 'LOP', 'UL', 'UNPAID'].includes(code)) return true;
  if (name.includes('unpaid') || name.includes('un-paid') || name.includes('loss of pay') || name.includes('lwp')) return true;
  return false;
}

type LeaveTypeLike = Pick<ILeaveType, 'paidLeave' | 'code' | 'name'> | null | undefined;

/** Paid unless `isUnpaidLeaveType` says otherwise (an unknown type counts as paid). */
const isPaid = (leaveType: LeaveTypeLike): boolean => !isUnpaidLeaveType(leaveType);

/** The leave year a date belongs to: the calendar year of its business day. */
export function leaveYear(date: Date): number {
  return startOfBusinessDay(date).getUTCFullYear();
}

// ---------- Working days ----------

/** What the working-day maths needs of an employee; `shift` may be populated or an id. */
export type LeaveEmployee = Pick<IEmployee, 'shift' | 'department'>;

const idOf = (value: unknown): Types.ObjectId | string | null => {
  if (value == null) return null;
  if (value instanceof Types.ObjectId) return value;
  if (typeof value === 'object' && '_id' in value) return (value as { _id: Types.ObjectId })._id;
  return String(value);
};

/**
 * The work days of the shift that governs the employee's days — their own,
 * else the company default (`resolveShift`, the chain late marks and
 * day-close use) — else Mon–Sat.
 */
async function workDaysOf(employee: LeaveEmployee): Promise<number[]> {
  return (await resolveShift(employee))?.workDays ?? DEFAULT_WORK_DAYS;
}

/** The day labels in `[start, end]` that are working days for `employee`. */
export async function leaveWorkingDays(start: Date, end: Date, employee: LeaveEmployee): Promise<Date[]> {
  const labels = businessDayLabels(start, end);
  if (labels.length === 0) return [];
  const [workDays, weekOffRule, holidays] = await Promise.all([
    workDaysOf(employee),
    getWeekOffRule(),
    listHolidaysBetween(localDateOf(labels[0]!), localDateOf(labels[labels.length - 1]!)),
  ]);
  const departmentId = idOf(employee.department);
  return labels.filter(
    (day) => classifyDay(localDateOf(day), { workDays, weekOffRule, holidays, departmentId }) === 'working',
  );
}

// ---------- Stamping ----------

/**
 * Write the attendance one working day (`day`, a day label) of an approved
 * leave produces for `employeeId`:
 *   • no row → create it: half day → `half_day`, paid → `on_leave`,
 *     unpaid → `absent`, with `leaveRequestId`, `isPaidLeave`, `source: 'leave'`;
 *   • a row with a check-in → the person worked (some of) the day: only tag it
 *     with `leaveRequestId` / `isPaidLeave`, its status stays;
 *   • a row without one (e.g. day-close's `auto_absent`) → it becomes the leave row.
 * Returns false only when nothing could be written: a soft-deleted row still
 * holds the day in the unique `(employeeId, date)` index.
 */
export async function stampLeaveDay(
  request: Pick<ILeaveRequest, '_id' | 'isHalfDay'>,
  leaveType: LeaveTypeLike,
  employeeId: Types.ObjectId,
  day: Date,
): Promise<boolean> {
  const isPaidLeave = isPaid(leaveType);
  const leaveRequestId = request._id as Types.ObjectId;
  const status: AttendanceStatus = request.isHalfDay ? 'half_day' : isPaidLeave ? 'on_leave' : 'absent';
  const leaveRow = { status, isPaidLeave, leaveRequestId, source: 'leave' as const };

  try {
    await Attendance.create({ employeeId, date: day, ...leaveRow });
    return true;
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }

  const date = { $gte: day, $lte: endOfBusinessDay(day) };
  const punched = await Attendance.updateOne(
    { employeeId, date, 'checkIn.time': { $ne: null } },
    { $set: { leaveRequestId, isPaidLeave } },
  ).exec();
  if (punched.matchedCount > 0) return true;
  const plain = await Attendance.updateOne(
    { employeeId, date, 'checkIn.time': null },
    { $set: leaveRow },
  ).exec();
  return plain.matchedCount > 0;
}

/**
 * Stamp every working day of an approved leave (see `stampLeaveDay`).
 * Idempotent. Returns the number of rows written or tagged.
 */
export async function stampLeaveDays(
  request: ILeaveRequest,
  leaveType: LeaveTypeLike,
  employee: LeaveEmployee,
): Promise<number> {
  const days = await leaveWorkingDays(request.startDate, request.endDate, employee);
  let touched = 0;
  for (const day of days) {
    // eslint-disable-next-line no-await-in-loop
    if (await stampLeaveDay(request, leaveType, request.employeeId, day)) touched += 1;
  }
  return touched;
}

/**
 * Take back what `stampLeaveDays` wrote for this request:
 *   • rows it created (`source: 'leave'`, no check-in) are deleted — except on
 *     a day already over, which day-close will not revisit: with the leave
 *     gone that day is the absence day-close would have recorded, so it
 *     becomes `absent` / `auto_absent` instead of silently paid;
 *   • rows with a check-in lose `leaveRequestId` / `isPaidLeave` and are
 *     re-judged from their punches (`rejudgePunchedRows`): a worked day of a
 *     cancelled unpaid leave becomes `present` / `late`, not a stale `absent`;
 *   • any other row it tagged just loses the tag.
 * Returns the number of rows changed or removed.
 */
export async function unstampLeaveDays(
  request: Pick<ILeaveRequest, '_id'>,
  opts: { now?: Date } = {},
): Promise<number> {
  const today = startOfBusinessDay(opts.now ?? new Date());
  const leaveRequestId = request._id as Types.ObjectId;
  const untag = { $unset: { leaveRequestId: 1, isPaidLeave: 1 } };
  const created = { leaveRequestId, source: 'leave', 'checkIn.time': null };

  const closed = await Attendance.updateMany(
    { ...created, date: { $lt: today } },
    { $set: { status: 'absent', source: 'auto_absent' }, ...untag },
  ).exec();
  const removed = await Attendance.deleteMany({ ...created, date: { $gte: today } }).exec();
  // Before the bulk untag, so a retry after a failure here still finds them.
  const rejudged = await rejudgePunchedRows(leaveRequestId);
  const untagged = await Attendance.updateMany({ leaveRequestId }, untag).exec();
  return closed.modifiedCount + removed.deletedCount + rejudged + untagged.modifiedCount;
}

/**
 * Strip the leave from every punched row it tagged and judge the day from
 * its punches — the same `computeHours` + `applyShiftRules` with the
 * employee's shift (else the default shift) that check-out applies. A row
 * still open keeps its stored hours (they are only persisted at check-out).
 * Each row is saved on its own, untagged in the same write. Returns how many.
 */
async function rejudgePunchedRows(leaveRequestId: Types.ObjectId): Promise<number> {
  const rows = await Attendance.find({ leaveRequestId, 'checkIn.time': { $ne: null } }).exec();
  if (rows.length === 0) return 0;
  const [cfg, defaultShift, owners] = await Promise.all([
    AttendanceConfig.findOne({}).exec(),
    Shift.findOne({ isDefault: true }).exec(),
    Employee.find({ _id: { $in: [...new Set(rows.map((r) => String(r.employeeId)))] } })
      .setOptions({ withDeleted: true })
      .select('_id shift')
      .populate('shift')
      .exec(),
  ]);
  const shiftOf = new Map(
    await Promise.all(owners.map(async (e) => [String(e._id), await resolveShift(e, { defaultShift })] as const)),
  );
  for (const row of rows) {
    row.set('leaveRequestId', undefined);
    row.set('isPaidLeave', undefined);
    if (row.checkOut?.time) row.totalWorkingHours = computeHours(row, row.checkOut.time);
    applyShiftRules(row, shiftOf.get(String(row.employeeId)) ?? defaultShift, cfg);
    // eslint-disable-next-line no-await-in-loop
    await row.save();
  }
  return rows.length;
}

// ---------- Balances ----------

interface BalanceKey {
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
}

type ChargeableRequest = Pick<ILeaveRequest, 'employeeId' | 'leaveTypeId' | 'startDate' | 'days'>;

const balanceKeyOf = (request: ChargeableRequest): BalanceKey => ({
  employeeId: request.employeeId,
  leaveTypeId: request.leaveTypeId,
  year: leaveYear(request.startDate),
});

/** A balance field, 0 when a legacy row lacks it. */
const field = (name: string) => ({ $ifNull: [`$${name}`, 0] });

/**
 * Make sure the balance row exists, allocating the type's annual quota the
 * first time it is used — pro-rated to when the employee joined (the same
 * `proRataAllocation` opening the year uses) — so HR need not bulk-allocate
 * before anyone applies. An existing row is never touched.
 */
export async function ensureLeaveBalance(
  key: BalanceKey,
  leaveType: Pick<ILeaveType, 'daysAllowed'> | null | undefined,
): Promise<void> {
  if (await LeaveBalance.exists(key)) return;
  const employee = await Employee.findById(key.employeeId)
    .select('joiningDate')
    .setOptions({ withDeleted: true })
    .lean<{ joiningDate?: Date }>()
    .exec();
  const daysAllowed = leaveType?.daysAllowed ?? 0;
  const allocated = employee?.joiningDate
    ? proRataAllocation(daysAllowed, employee.joiningDate, key.year)
    : daysAllowed;
  try {
    await LeaveBalance.updateOne(key, { $setOnInsert: { allocated } }, { upsert: true }).exec();
  } catch (err) {
    // A concurrent first use created it.
    if (!isDuplicateKey(err)) throw err;
  }
}

/**
 * `remaining` = allocated + carried + adjusted − used (0 with no balance row);
 * `pending` = the days of this employee's `pending` requests of that type
 * whose leave year is `year` — already promised, not yet charged.
 */
export async function availableBalance(
  employeeId: Types.ObjectId,
  leaveTypeId: Types.ObjectId,
  year: number,
): Promise<{ remaining: number; pending: number }> {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const [balance, pendingRequests] = await Promise.all([
    LeaveBalance.findOne({ employeeId, leaveTypeId, year }).lean().exec(),
    // Coarse ±1 day window; the exact leave-year test is below.
    LeaveRequest.find({
      employeeId,
      leaveTypeId,
      status: 'pending',
      startDate: { $gte: new Date(Date.UTC(year, 0, 1) - DAY_MS), $lt: new Date(Date.UTC(year + 1, 0, 1) + DAY_MS) },
    })
      .select('startDate days')
      .lean()
      .exec(),
  ]);
  const remaining = balance
    ? (balance.allocated ?? 0) + (balance.carried ?? 0) + (balance.adjusted ?? 0) - (balance.used ?? 0)
    : 0;
  const pending = pendingRequests
    .filter((r) => leaveYear(r.startDate) === year)
    .reduce((sum, r) => sum + (r.days ?? 0), 0);
  return { remaining, pending };
}

/**
 * Charge an approved request's days to its balance. For a paid type this is
 * one conditional write — `used` only moves if the remaining balance still
 * covers the request at that instant — so concurrent approvals can never
 * overdraw it; otherwise 400 `INSUFFICIENT_BALANCE` and nothing changes.
 * Unpaid leave is not limited by a balance; `used` just records it.
 */
export async function chargeLeaveBalance(
  request: ChargeableRequest,
  leaveType: Pick<ILeaveType, 'paidLeave' | 'code' | 'name' | 'daysAllowed'> | null,
): Promise<void> {
  const key = balanceKeyOf(request);
  await ensureLeaveBalance(key, leaveType);
  if (!isPaid(leaveType)) {
    await LeaveBalance.updateOne(key, { $inc: { used: request.days } }).exec();
    return;
  }
  const charged = await LeaveBalance.findOneAndUpdate(
    {
      ...key,
      $expr: {
        $gte: [
          { $subtract: [{ $add: [field('allocated'), field('carried'), field('adjusted')] }, field('used')] },
          request.days,
        ],
      },
    },
    { $inc: { used: request.days } },
  ).exec();
  if (!charged) {
    throw new AppError(
      `Insufficient ${leaveType?.name ?? 'leave'} balance to approve ${request.days} day(s)`,
      400,
      'INSUFFICIENT_BALANCE',
    );
  }
}

/** Give back a charged request's days (never taking `used` below zero). */
export async function refundLeaveBalance(request: ChargeableRequest): Promise<void> {
  await LeaveBalance.updateOne(balanceKeyOf(request), [
    { $set: { used: { $max: [0, { $subtract: [field('used'), request.days] }] } } },
  ]).exec();
}

/**
 * Undo an approval: remove the request's attendance rows and refund its
 * days. For cancelling or deleting an approved request.
 */
export async function releaseApprovedLeave(
  request: ChargeableRequest & Pick<ILeaveRequest, '_id'>,
): Promise<void> {
  await unstampLeaveDays(request);
  await refundLeaveBalance(request);
}

/**
 * Move a request from its current status to `cancelled` — a conditional
 * write, so of two concurrent cancels/deletes only one gets past here — and,
 * if it was approved, release its attendance rows and charged days. If the
 * release fails the request goes back to `approved` and the error is
 * rethrown, so the cancel can simply be retried (releasing is idempotent
 * until its last step, the refund). Returns null, changing nothing, when the
 * request was decided or withdrawn meanwhile.
 *
 * The one cancellation path: HR / the owner cancelling, deleting an approved
 * request, and an employee's exit cancelling their leave after it.
 */
export async function cancelAndReleaseLeave(
  doc: ILeaveRequest,
  set: { cancelReason?: string } = {},
): Promise<ILeaveRequest | null> {
  const from = doc.status;
  const cancelled = await LeaveRequest.findOneAndUpdate(
    { _id: doc._id, status: from },
    { $set: { status: 'cancelled', ...set } },
    { new: true },
  ).exec();
  if (!cancelled) return null;
  if (from !== 'approved') return cancelled;
  try {
    await releaseApprovedLeave(doc);
  } catch (err) {
    try {
      await LeaveRequest.updateOne(
        { _id: doc._id, status: 'cancelled' },
        { $set: { status: 'approved' }, $unset: { cancelReason: 1 } },
      ).exec();
    } catch (revertErr) {
      logger.error(
        { err: revertErr, cause: err, requestId: String(doc._id) },
        'leave cancel: release failed and the request could not be put back to approved',
      );
    }
    throw err;
  }
  return cancelled;
}
