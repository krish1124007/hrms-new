import type { IAttendance } from '../models/attendance.model.js';
import type { IAttendanceConfig } from '../models/attendance-config.model.js';
import { type IShift } from '../models/shift.model.js';
interface BreakLike {
    startTime?: Date | string | null;
    endTime?: Date | string | null;
}
export interface WorkedHoursSource {
    date?: Date | string | null;
    checkIn?: {
        time?: Date | string | null;
    } | null;
    checkOut?: {
        time?: Date | string | null;
    } | null;
    breaks?: BreakLike[];
    totalWorkingHours?: number;
}
/**
 * Worked hours up to `at` (or up to the check-out, when there is one), minus
 * breaks, rounded to 2 decimals — the unit `totalWorkingHours` uses.
 */
export declare function computeHours(att: WorkedHoursSource, at: Date): number;
/**
 * The shift fields the day rules read. Times are `HH:mm` in the business
 * timezone; the numeric fields may be missing on legacy lean reads, in which
 * case the configured thresholds apply.
 */
export type ShiftRulesSource = Pick<IShift, 'startTime' | 'endTime'> & Partial<Pick<IShift, 'graceMinutes' | 'halfDayHours' | 'fullDayHours' | 'isNightShift'>>;
/**
 * Whether a shift runs past midnight — flagged as a night shift, or ending
 * at an earlier clock time than it starts. Such a shift's day ends on the
 * next calendar day.
 */
export declare function isOvernightShift(shift: (Pick<IShift, 'startTime' | 'endTime'> & Partial<Pick<IShift, 'isNightShift'>>) | null | undefined): boolean;
/**
 * The instants a shift starts and ends for the business day `day` (a day
 * label, see `lib/business-day.ts`). An `endTime` earlier than `startTime`
 * (22:00 → 06:00) ends on the next day. Null when the shift has no usable
 * times.
 */
export declare function shiftWindow(day: Date, shift: Pick<IShift, 'startTime' | 'endTime'> | null | undefined): {
    start: Date;
    end: Date;
} | null;
/**
 * The day label a check-in at `at` is filed under: the business day it falls
 * on — except inside the tail of an overnight shift that began the evening
 * before (a 22:00 → 06:00 shift punched at 00:30), which belongs to that
 * evening's day, so a late arrival does not open a row for the wrong night.
 */
export declare function attendanceDayFor(at: Date, shift: (Pick<IShift, 'startTime' | 'endTime'> & Partial<Pick<IShift, 'isNightShift'>>) | null | undefined): Date;
/**
 * How long after an overnight shift's end its open row still counts as the
 * running day — the employee can check out, take a break, see live hours.
 * Staying on past a night shift is routine; `graceMinutes` is a lateness
 * tolerance, not an overtime allowance.
 */
export declare const OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS = 6;
/**
 * Until when an open overnight row of business day `day` is still the day in
 * progress: shift end + `OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS`. Past it the row
 * is a forgotten check-out — no punch closes it (a punch the next evening
 * would record a 24-hour day); the nightly day-close does, at shift end +
 * grace. Null when the shift has no usable times.
 */
export declare function shiftDeadline(day: Date, shift: ShiftRulesSource | null | undefined): Date | null;
/**
 * Whether a row is a day still in progress at `now`: checked in, not out,
 * and either on today's business day, or — on an overnight shift — on an
 * earlier day whose shift has not reached `shiftDeadline` yet (a 22:00 →
 * 06:00 shift until 12:00). Anything else open is a forgotten check-out: it
 * must not report hours growing without bound (a day missed in August once
 * reported 44.67 h and climbing) nor be closed by a punch hours later.
 */
export declare function isRowInProgress(att: WorkedHoursSource, shift: ShiftRulesSource | null | undefined, now: Date): boolean;
/**
 * The shift that governs an employee's day: their own (populated, or loaded
 * by id), else the company default shift (`isDefault: true`), else none.
 * A soft-deleted assigned shift falls through to the default. Pass
 * `defaultShift` when it is already loaded (batch callers) to skip that query.
 */
export declare function resolveShift(employee: {
    shift?: unknown;
} | null | undefined, opts?: {
    defaultShift?: IShift | null;
}): Promise<IShift | null>;
/**
 * Judge a day from scratch — the same verdict for check-in, check-out, HR
 * corrections and day-close, however often it is re-run. Reads the punches,
 * `date` and (for the hours rules) `totalWorkingHours`, which the caller sets
 * first via `computeHours`. On the row's business day, in business time:
 *
 *   • `lateBy` = minutes the check-in is past shift start + `graceMinutes`
 *     (0 without a shift: there is no start to be late for);
 *   • `earlyLeaveBy` = minutes the check-out is before shift end (0 without a
 *     shift or a check-out). An overnight shift ends on the next day;
 *   • `overtimeHours` beyond `fullDayHours` of the shift, else beyond the
 *     configured `overtimeThresholdMinutes` (0 until checked out);
 *   • `status`: a leave-stamped row keeps its leave status; otherwise
 *     `half_day` when checked out under the shift's `halfDayHours` (else the
 *     configured `halfDayThresholdHours`), else `late` when `lateBy > 0`,
 *     else `present`. Half day wins over late: a short day is a short day.
 *
 * Rows without a check-in are left as they are. Mutates `att`; the caller saves it.
 */
export declare function applyShiftRules(att: IAttendance, shift: ShiftRulesSource | null, cfg: IAttendanceConfig | null): void;
export {};
//# sourceMappingURL=attendance-hours.d.ts.map