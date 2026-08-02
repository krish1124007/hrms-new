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
/** Sunday every week, plus the 4th Saturday. */
export const DEFAULT_WEEK_OFF_RULE = {
    fullDaysOff: [0],
    partialDaysOff: [{ day: 6, weeks: [4] }],
};
/** Mon–Sat. Which of those are actually off comes from the week-off rule. */
export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6];
/**
 * Which occurrence of its weekday this date is within the month — the 3rd
 * Tuesday returns 3. Days 1-7 are the 1st, 8-14 the 2nd, and so on.
 */
export function occurrenceInMonth(date) {
    return Math.ceil(date.getDate() / 7);
}
/** True when the company does not work on `date` (ignores public holidays). */
export function isWeekOff(date, rule = DEFAULT_WEEK_OFF_RULE) {
    const dow = date.getDay();
    if (rule.fullDaysOff.includes(dow))
        return true;
    const partial = rule.partialDaysOff.find((p) => p.day === dow);
    return partial ? partial.weeks.includes(occurrenceInMonth(date)) : false;
}
/** Number of week-off days in the given month. `month` is 1-12. */
export function countWeekOffsInMonth(year, month, rule = DEFAULT_WEEK_OFF_RULE) {
    const days = new Date(year, month, 0).getDate();
    let count = 0;
    for (let d = 1; d <= days; d++) {
        if (isWeekOff(new Date(year, month - 1, d), rule))
            count += 1;
    }
    return count;
}
/**
 * Working days between `start` and `end` inclusive.
 *
 * @param workDays  Shift work days (0=Sun..6=Sat). Defaults to Mon–Sat.
 * @param holidays  ISO `YYYY-MM-DD` keys of public holidays to skip.
 */
export function countWorkingDays(start, end, workDays = DEFAULT_WORK_DAYS, holidays = new Set(), rule = DEFAULT_WEEK_OFF_RULE) {
    let count = 0;
    const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    while (cur <= last) {
        if (!isWeekOff(cur, rule) && workDays.includes(cur.getDay()) && !holidays.has(toKey(cur))) {
            count += 1;
        }
        cur.setDate(cur.getDate() + 1);
    }
    return count;
}
/** Local `YYYY-MM-DD` key — avoids the UTC shift `toISOString()` introduces. */
export function toKey(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${d}`;
}
//# sourceMappingURL=week-off.js.map