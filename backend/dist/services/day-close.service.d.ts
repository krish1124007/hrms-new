export interface DayCloseCounts {
    /** `absent` rows written for working days with no row. */
    absentCreated: number;
    /** Leave rows written for days an approved leave covers. */
    leaveStamped: number;
    /**
     * Open check-ins closed: the day's own at the auto-checkout time, and the
     * previous day's overnight-shift ones at shift end + grace.
     */
    autoCheckedOut: number;
    /**
     * Nothing written although the employee/row was in scope: a non-working
     * day for them, a soft-deleted row already holding the day, a check-in
     * that raced the job, an auto-checkout time that has not arrived yet, or
     * an open row on an overnight shift.
     */
    skipped: number;
    /** Scheduled exits applied: employees whose exit date had come, now out. */
    exitsApplied: number;
}
/** One leave stamp, auto-checkout or scheduled exit that threw. */
export interface DayCloseFailure {
    step: 'leave-stamp' | 'auto-checkout' | 'scheduled-exit';
    employeeId: string;
    /** Set for an auto-checkout failure: the open row that could not be closed. */
    attendanceId?: string;
    message: string;
}
/**
 * Some rows of the day could not be written. `counts` is what did succeed;
 * `failures` names each row that did not (the causes are in `errors`).
 */
export declare class DayCloseError extends AggregateError {
    readonly day: string;
    readonly counts: DayCloseCounts;
    readonly failures: DayCloseFailure[];
    constructor(day: string, counts: DayCloseCounts, failures: DayCloseFailure[], causes: unknown[]);
}
/** Check-out time used when `settings.autoCheckoutTime` is unset or invalid. */
export declare const DEFAULT_AUTO_CHECKOUT_TIME = "23:59";
/**
 * Close the business day containing `dateIST` (any instant; it is resolved to
 * its calendar day in the business timezone). With `dryRun`, returns the
 * counts it would produce without writing anything.
 */
export declare function closeBusinessDay(dateIST: Date, opts?: {
    dryRun?: boolean;
}): Promise<DayCloseCounts>;
export interface ScheduledExitsResult {
    exitsApplied: number;
    failures: DayCloseFailure[];
    causes: unknown[];
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
export declare function applyScheduledExits(dateIST: Date, opts?: {
    dryRun?: boolean;
}): Promise<ScheduledExitsResult>;
//# sourceMappingURL=day-close.service.d.ts.map