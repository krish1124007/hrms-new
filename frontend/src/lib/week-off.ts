/**
 * Company week-off rule.
 *
 * The rule is configured by an admin under Attendance → Settings and arrives
 * with the attendance config (`weekOff`). Pass it in; the default below is
 * only the fallback for the moment before the config has loaded.
 *
 * Mirror of `backend/src/lib/week-off.ts` and `mobile/src/utils/week-off.ts`.
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
export const DEFAULT_WEEK_OFF_RULE: WeekOffRule = {
  fullDaysOff: [0],
  partialDaysOff: [{ day: 6, weeks: [4] }],
};

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEK_LABELS: Record<number, string> = {
  1: '1st',
  2: '2nd',
  3: '3rd',
  4: '4th',
  5: '5th',
};

/**
 * Which occurrence of its weekday this date is within the month — the 3rd
 * Tuesday returns 3. Days 1-7 are the 1st, 8-14 the 2nd, and so on.
 */
export function occurrenceInMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

/** True when the company does not work on `date` (ignores public holidays). */
export function isWeekOff(date: Date, rule: WeekOffRule = DEFAULT_WEEK_OFF_RULE): boolean {
  const dow = date.getDay();
  if (rule.fullDaysOff.includes(dow)) return true;
  const partial = rule.partialDaysOff.find((p) => p.day === dow);
  return partial ? partial.weeks.includes(occurrenceInMonth(date)) : false;
}

/** Human-readable summary, e.g. "Sunday, plus the 2nd and 4th Saturday". */
export function describeWeekOff(rule: WeekOffRule): string {
  const full = rule.fullDaysOff.map((d) => DAY_NAMES[d]);
  const partial = rule.partialDaysOff
    .filter((p) => p.weeks.length > 0)
    .map((p) => {
      const weeks = [...p.weeks].sort((a, b) => a - b).map((w) => WEEK_LABELS[w] ?? `${w}th`);
      const list =
        weeks.length > 1 ? `${weeks.slice(0, -1).join(', ')} and ${weeks[weeks.length - 1]}` : weeks[0];
      return `the ${list} ${DAY_NAMES[p.day]}`;
    });
  if (full.length === 0 && partial.length === 0) return 'No weekly off days configured';
  if (partial.length === 0) return `${full.join(', ')} off every week`;
  if (full.length === 0) return `Off on ${partial.join(', ')}`;
  return `${full.join(', ')} every week, plus ${partial.join(', ')}`;
}
