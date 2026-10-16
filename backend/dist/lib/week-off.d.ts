/**
 * Company week-off rule — the single source of truth.
 *
 * The rule itself is configured by an admin under Attendance → Settings and
 * stored on the `AttendanceConfig` singleton. Two kinds of off day:
 *
 *   • `fullDaysOff`    — weekdays that are off every week (e.g. Sunday).
 *   • `partialDaysOff` — weekdays that are off only on certain occurrences in
 *                        the month (e.g. the 2nd and 4th Saturday).
 *
 * Anything that decides "is this a working day?" — leave day counting, shift
 * rosters, monthly attendance, working-day maths — must go through here so
 * the apps never disagree. Read the saved rule with
 * `services/week-off.service.ts#getWeekOffRule`; the default below is only
 * the fallback for a workspace that has never saved one.
 *
 * The same shape is mirrored in `frontend/src/lib/week-off.ts` and
 * `mobile/src/utils/week-off.ts`.
 */
/** A weekday that is off only on certain occurrences of the month. */
export interface PartialDayOff {
    /** 0=Sun .. 6=Sat */
    day: number;
    /** Which occurrences in the month are off, 1-5. e.g. [2, 4]. */
    weeks: number[];
}
export interface WeekOffRule {
    /** Weekdays off every week. 0=Sun .. 6=Sat. */
    fullDaysOff: number[];
    partialDaysOff: PartialDayOff[];
}
/** Sunday every week, plus the 4th Saturday. */
export declare const DEFAULT_WEEK_OFF_RULE: WeekOffRule;
/** Mon–Sat. Which of those are actually off comes from the week-off rule. */
export declare const DEFAULT_WORK_DAYS: number[];
/**
 * Which occurrence of its weekday this date is within the month — the 3rd
 * Tuesday returns 3. Days 1-7 are the 1st, 8-14 the 2nd, and so on.
 */
export declare function occurrenceInMonth(date: Date): number;
/** True when the company does not work on `date` (ignores public holidays). */
export declare function isWeekOff(date: Date, rule?: WeekOffRule): boolean;
/** Number of week-off days in the given month. `month` is 1-12. */
export declare function countWeekOffsInMonth(year: number, month: number, rule?: WeekOffRule): number;
/**
 * Working days between `start` and `end` inclusive.
 *
 * @param workDays  Shift work days (0=Sun..6=Sat). Defaults to Mon–Sat.
 * @param holidays  ISO `YYYY-MM-DD` keys of public holidays to skip.
 */
export declare function countWorkingDays(start: Date, end: Date, workDays?: number[], holidays?: Set<string>, rule?: WeekOffRule): number;
/** Local `YYYY-MM-DD` key — avoids the UTC shift `toISOString()` introduces. */
export declare function toKey(date: Date): string;
//# sourceMappingURL=week-off.d.ts.map