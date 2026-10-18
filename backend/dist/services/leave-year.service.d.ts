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
 *     then `proRataAllocation(daysAllowed, from, year − 1)`, where `from` is
 *     the later of their joining date and the leave type's creation date
 *     (a type that did not exist yet allocated nothing; 0 if either is after
 *     that year). A row that exists always wins over that figure.
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
import { AppError } from '../lib/errors.js';
import { proRataAllocation } from '../lib/leave-allocation.js';
import { type ILeaveType } from '../models/leave-type.model.js';
export { proRataAllocation };
/** What allocation needs of an employee: who they are and when they joined. */
export interface AllocatableEmployee {
    _id: Types.ObjectId | string;
    joiningDate: Date;
}
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
export declare class LeaveYearIncompleteError extends AppError {
    readonly year: number;
    readonly failed: number;
    readonly counts: OpenLeaveYearCounts;
    constructor(year: number, failed: number, counts: OpenLeaveYearCounts);
}
/**
 * Create the (employee, type, year) balance with its pro-rated allocation
 * unless one exists. True only if this call created it.
 */
export declare function allocateLeaveType(employee: AllocatableEmployee, leaveType: Pick<ILeaveType, '_id' | 'daysAllowed'>, year: number): Promise<boolean>;
/**
 * Give `employee` a balance for `year` for every active paid leave type that
 * has none, pro-rated to when they joined. Never overwrites. Returns the
 * number of rows created.
 */
export declare function allocateForEmployee(employee: AllocatableEmployee, year: number): Promise<number>;
/**
 * Open `year` for every active employee (or just `opts.employeeIds`): create
 * the balances that are missing, pro-rated for mid-year joiners, then carry
 * the previous year's remainder forward for types that allow it.
 *
 * Idempotent. One employee failing does not stop the rest; the run then
 * throws (a retry finishes the job) once everyone else has been done.
 */
export declare function openLeaveYear(year: number, opts?: {
    employeeIds?: string[];
}): Promise<OpenLeaveYearCounts>;
//# sourceMappingURL=leave-year.service.d.ts.map