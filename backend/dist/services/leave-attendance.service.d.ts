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
import { type IEmployee } from '../models/employee.model.js';
import { type ILeaveRequest } from '../models/leave-request.model.js';
import type { ILeaveType } from '../models/leave-type.model.js';
/**
 * Unpaid leave: `paidLeave: false`, or a type whose code/name says so (LWP,
 * LOP, "unpaid", "loss of pay") even if the flag was never cleared.
 */
export declare function isUnpaidLeaveType(leaveType?: {
    paidLeave?: boolean;
    code?: string;
    name?: string;
} | null): boolean;
type LeaveTypeLike = Pick<ILeaveType, 'paidLeave' | 'code' | 'name'> | null | undefined;
/** The leave year a date belongs to: the calendar year of its business day. */
export declare function leaveYear(date: Date): number;
/** What the working-day maths needs of an employee; `shift` may be populated or an id. */
export type LeaveEmployee = Pick<IEmployee, 'shift' | 'department'>;
/** The day labels in `[start, end]` that are working days for `employee`. */
export declare function leaveWorkingDays(start: Date, end: Date, employee: LeaveEmployee): Promise<Date[]>;
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
export declare function stampLeaveDay(request: Pick<ILeaveRequest, '_id' | 'isHalfDay'>, leaveType: LeaveTypeLike, employeeId: Types.ObjectId, day: Date): Promise<boolean>;
/**
 * Stamp every working day of an approved leave (see `stampLeaveDay`).
 * Idempotent. Returns the number of rows written or tagged.
 */
export declare function stampLeaveDays(request: ILeaveRequest, leaveType: LeaveTypeLike, employee: LeaveEmployee): Promise<number>;
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
export declare function unstampLeaveDays(request: Pick<ILeaveRequest, '_id'>, opts?: {
    now?: Date;
}): Promise<number>;
interface BalanceKey {
    employeeId: Types.ObjectId;
    leaveTypeId: Types.ObjectId;
    year: number;
}
type ChargeableRequest = Pick<ILeaveRequest, 'employeeId' | 'leaveTypeId' | 'startDate' | 'days'>;
/**
 * Make sure the balance row exists, allocating the type's annual quota the
 * first time it is used — pro-rated to when the employee joined (the same
 * `proRataAllocation` opening the year uses) — so HR need not bulk-allocate
 * before anyone applies. An existing row is never touched.
 */
export declare function ensureLeaveBalance(key: BalanceKey, leaveType: Pick<ILeaveType, 'daysAllowed'> | null | undefined): Promise<void>;
/**
 * `remaining` = allocated + carried + adjusted − used (0 with no balance row);
 * `pending` = the days of this employee's `pending` requests of that type
 * whose leave year is `year` — already promised, not yet charged.
 */
export declare function availableBalance(employeeId: Types.ObjectId, leaveTypeId: Types.ObjectId, year: number): Promise<{
    remaining: number;
    pending: number;
}>;
/**
 * Charge an approved request's days to its balance. For a paid type this is
 * one conditional write — `used` only moves if the remaining balance still
 * covers the request at that instant — so concurrent approvals can never
 * overdraw it; otherwise 400 `INSUFFICIENT_BALANCE` and nothing changes.
 * Unpaid leave is not limited by a balance; `used` just records it.
 */
export declare function chargeLeaveBalance(request: ChargeableRequest, leaveType: Pick<ILeaveType, 'paidLeave' | 'code' | 'name' | 'daysAllowed'> | null): Promise<void>;
/** Give back a charged request's days (never taking `used` below zero). */
export declare function refundLeaveBalance(request: ChargeableRequest): Promise<void>;
/**
 * Undo an approval: remove the request's attendance rows and refund its
 * days. For cancelling or deleting an approved request.
 */
export declare function releaseApprovedLeave(request: ChargeableRequest & Pick<ILeaveRequest, '_id'>): Promise<void>;
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
export declare function cancelAndReleaseLeave(doc: ILeaveRequest, set?: {
    cancelReason?: string;
}): Promise<ILeaveRequest | null>;
export {};
//# sourceMappingURL=leave-attendance.service.d.ts.map