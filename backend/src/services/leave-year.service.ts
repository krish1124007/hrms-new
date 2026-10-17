/**
 * The leave year: opening it, pro-rating a joiner's allowance, carrying
 * unused days forward.
 *
 * Balances are one row per (employee, leave type, year). Nothing used to
 * create next year's rows or move December's remainder across — it vanished
 * on 1 January — and anyone who joined mid-year was lazily given a full
 * year's `daysAllowed` the first time they applied.
 *
 *   • Pro-rata. Joined before the year → the full allowance. Joined during
 *     it → `daysAllowed × (12 − joiningMonthIndex) / 12`, the joining month
 *     counting in full (January is 12/12, December 1/12), rounded half-up to
 *     the nearest 0.5 day. The month is read in the business timezone, so an
 *     employee who started at 01:30 IST on 1 July joined in July.
 *   • Allocation never overwrites. A balance row is only created where none
 *     exists, so HR's hand-set figures, `used` and `adjusted` survive any
 *     re-run. Unpaid and inactive types get no allocation; neither does a
 *     pro-rated figure of 0 (no row is better than a 0 row HR cannot top up).
 *   • Carry-forward. For types with `carryForward.enabled`, the new year's
 *     `carried` is `min(max(remaining, 0), carryForward.maxDays)`, where
 *     `remaining = allocated + carried + adjusted − used` of the year before.
 *     Balances are allocated lazily, so an employee who never applied for a
 *     type has no row for it: their previous-year allocation was never
 *     materialised, but it was theirs and entirely unused, so `remaining` is
 *     then `proRataAllocation(daysAllowed, joiningDate, year − 1)` (0 if they
 *     joined after that year). A row that exists always wins over that figure.
 *     It is set only while `carried` is still 0, so it is applied once.
 *   • `openLeaveYear` is idempotent and safe to repeat — by the 1 Jan job, by
 *     HR from the UI, or to finish a run that failed part way.
 *
 * `proRataAllocation` lives in lib/leave-allocation (shared with the
 * leave-attendance service's first-use allocation, so there is one rule).
 * This module depends on leave-attendance.service (the unpaid-type rules);
 * that module does not import this one.
 */
import { Types } from 'mongoose';
import { logger } from '../config/logger.js';
import { AppError } from '../lib/errors.js';
import { isDuplicateKey, proRataAllocation } from '../lib/leave-allocation.js';
import { Employee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import { isUnpaidLeaveType } from './leave-attendance.service.js';

export { proRataAllocation };

/** What allocation needs of an employee: who they are and when they joined. */
export interface AllocatableEmployee {
  _id: Types.ObjectId | string;
  joiningDate: Date;
}

type AllocatableType = Pick<ILeaveType, '_id' | 'daysAllowed' | 'carryForward'>;

export interface OpenLeaveYearCounts {
  /** Balance rows created. */
  created: number;
  /** Balances that received a carried-forward figure. */
  carried: number;
  /** (employee, leave type) pairs left as they were: the balance already existed, or there was nothing to allocate. */
  skipped: number;
}

/**
 * A run that did not finish: `failed` employees could not be processed; every
 * other employee was. `counts` is what was written before and around the
 * failures. Running the year again finishes it.
 */
export class LeaveYearIncompleteError extends AppError {
  public readonly year: number;
  public readonly failed: number;
  public readonly counts: OpenLeaveYearCounts;

  constructor(year: number, failed: number, counts: OpenLeaveYearCounts) {
    super(
      `Opening leave year ${year} failed for ${failed} employee(s); the rest were done — run it again to finish`,
      500,
      'LEAVE_YEAR_INCOMPLETE',
      { year, failed, ...counts },
    );
    this.year = year;
    this.failed = failed;
    this.counts = { ...counts };
  }
}

/** Active, paid leave types: the ones that carry an annual allocation. */
async function allocatableTypes(): Promise<AllocatableType[]> {
  const types = await LeaveType.find({ isActive: true, paidLeave: { $ne: false } })
    .lean<(AllocatableType & Pick<ILeaveType, 'code' | 'name' | 'paidLeave'>)[]>()
    .exec();
  return types.filter((type) => !isUnpaidLeaveType(type));
}

/**
 * Create the (employee, type, year) balance with its pro-rated allocation
 * unless one exists. True only if this call created it.
 */
export async function allocateLeaveType(
  employee: AllocatableEmployee,
  leaveType: Pick<ILeaveType, '_id' | 'daysAllowed'>,
  year: number,
): Promise<boolean> {
  const key = { employeeId: employee._id, leaveTypeId: leaveType._id, year };
  if (await LeaveBalance.exists(key)) return false;
  const allocated = proRataAllocation(leaveType.daysAllowed ?? 0, employee.joiningDate, year);
  if (!(allocated > 0)) return false;
  try {
    // An insert, not an upsert: an upsert that finds the row would still bump
    // its `updatedAt`, and a repeat run must touch nothing.
    await LeaveBalance.create({ ...key, allocated });
    return true;
  } catch (err) {
    // The balance already exists (or a concurrent allocation just created it).
    if (isDuplicateKey(err)) return false;
    throw err;
  }
}

/**
 * Allocate every type for one employee, keeping `counts` current as each row
 * is written (so a failure part way still leaves it accurate).
 */
async function allocateTypes(
  employee: AllocatableEmployee,
  types: readonly AllocatableType[],
  year: number,
  counts: OpenLeaveYearCounts,
): Promise<void> {
  for (const type of types) {
    // eslint-disable-next-line no-await-in-loop
    if (await allocateLeaveType(employee, type, year)) counts.created += 1;
    else counts.skipped += 1;
  }
}

/**
 * Give `employee` a balance for `year` for every active paid leave type that
 * has none, pro-rated to when they joined. Never overwrites. Returns the
 * number of rows created.
 */
export async function allocateForEmployee(employee: AllocatableEmployee, year: number): Promise<number> {
  const counts: OpenLeaveYearCounts = { created: 0, carried: 0, skipped: 0 };
  await allocateTypes(employee, await allocatableTypes(), year, counts);
  return counts.created;
}

/**
 * Carry the previous year's remainder into `year` for the given
 * carry-forward types, adding to `counts.carried` for each balance that
 * receives one.
 */
async function carryForward(
  employee: AllocatableEmployee,
  types: readonly AllocatableType[],
  year: number,
  counts: OpenLeaveYearCounts,
): Promise<void> {
  if (types.length === 0) return;
  const previous = await LeaveBalance.find({
    employeeId: employee._id,
    leaveTypeId: { $in: types.map((type) => type._id) },
    year: year - 1,
  })
    .lean()
    .exec();

  for (const type of types) {
    const before = previous.find((balance) => String(balance.leaveTypeId) === String(type._id));
    // No row: nothing of the previous year's allocation was used (a row appears
    // with the first application), so all of what they were due is left.
    const remaining = before
      ? (before.allocated ?? 0) + (before.carried ?? 0) + (before.adjusted ?? 0) - (before.used ?? 0)
      : proRataAllocation(type.daysAllowed ?? 0, employee.joiningDate, year - 1);
    const amount = Math.min(Math.max(remaining, 0), type.carryForward?.maxDays ?? 0);
    if (!(amount > 0)) continue;
    // Only while nothing has been carried yet, so a re-run leaves it be.
    // eslint-disable-next-line no-await-in-loop
    const result = await LeaveBalance.updateOne(
      { employeeId: employee._id, leaveTypeId: type._id, year, carried: { $in: [0, null] } },
      { $set: { carried: amount } },
    ).exec();
    if (result.modifiedCount > 0) counts.carried += 1;
  }
}

/**
 * Open `year` for every active employee (or just `opts.employeeIds`): create
 * the balances that are missing, pro-rated for mid-year joiners, then carry
 * the previous year's remainder forward for types that allow it.
 *
 * Idempotent. One employee failing does not stop the rest; the run then
 * throws (a retry finishes the job) once everyone else has been done.
 */
export async function openLeaveYear(
  year: number,
  opts: { employeeIds?: string[] } = {},
): Promise<OpenLeaveYearCounts> {
  const types = await allocatableTypes();
  const carryTypes = types.filter((type) => type.carryForward?.enabled);
  // Employees on notice still work and apply; only those who have left are out.
  const filter: Record<string, unknown> = { status: { $in: ['active', 'onNotice'] } };
  if (opts.employeeIds) filter._id = { $in: opts.employeeIds.map((id) => new Types.ObjectId(id)) };
  const employees = await Employee.find(filter)
    .select('_id joiningDate')
    .lean<AllocatableEmployee[]>()
    .exec();

  const counts: OpenLeaveYearCounts = { created: 0, carried: 0, skipped: 0 };
  let failed = 0;
  for (const employee of employees) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await allocateTypes(employee, types, year, counts);
      // eslint-disable-next-line no-await-in-loop
      await carryForward(employee, carryTypes, year, counts);
    } catch (err) {
      failed += 1;
      logger.error({ err, year, employeeId: String(employee._id) }, 'openLeaveYear: employee failed');
    }
  }

  logger.info({ year, ...counts, failed }, 'openLeaveYear: complete');
  if (failed > 0) throw new LeaveYearIncompleteError(year, failed, counts);
  return counts;
}
