import { formatDate, formatList } from './format';
import type { ScheduleRule } from './field.api';

/*
 * Recurring visit rules (`POST /field/visit-schedules` → `rule`). The editor
 * works on a draft that keeps both the weekdays and the day of the month, so
 * switching between weekly and monthly loses nothing; `buildRule` sends only
 * the half that applies.
 */

/** ISO weekdays: 1 = Monday … 7 = Sunday. */
export const WEEKDAYS: ReadonlyArray<{ value: number; short: string }> = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
];

/**
 * Day of the month a monthly rule may name. Capped at 28 so every month has
 * the day — no guessing what "the 31st" means in February.
 */
export const MAX_DAY_OF_MONTH = 28;

export interface RuleDraft {
  freq: ScheduleRule['freq'];
  weekdays: number[];
  dayOfMonth: number;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** `YYYY-MM-DD`, or '' for no end. */
  endDate: string;
}

export function emptyRuleDraft(startDate: string): RuleDraft {
  return { freq: 'weekly', weekdays: [], dayOfMonth: 1, startDate, endDate: '' };
}

export function draftFromRule(rule: ScheduleRule): RuleDraft {
  return {
    freq: rule.freq,
    weekdays: [...(rule.weekdays ?? [])].sort((a, b) => a - b),
    dayOfMonth: rule.dayOfMonth ?? 1,
    startDate: rule.startDate.slice(0, 10),
    endDate: rule.endDate ? rule.endDate.slice(0, 10) : '',
  };
}

/** Why the draft cannot be saved, or `null` when it can. */
export function ruleError(d: RuleDraft): string | null {
  if (!d.startDate) return 'Choose the first day.';
  if (d.freq === 'weekly' && d.weekdays.length === 0) return 'Pick at least one day of the week.';
  if (d.freq === 'monthly' && !(Number.isInteger(d.dayOfMonth) && d.dayOfMonth >= 1 && d.dayOfMonth <= MAX_DAY_OF_MONTH)) {
    return `The day of the month must be between 1 and ${MAX_DAY_OF_MONTH}.`;
  }
  if (d.endDate && d.endDate < d.startDate) return 'The end date is before the first day.';
  return null;
}

export function buildRule(d: RuleDraft): ScheduleRule {
  const base =
    d.freq === 'weekly'
      ? { freq: 'weekly' as const, weekdays: [...new Set(d.weekdays)].sort((a, b) => a - b) }
      : { freq: 'monthly' as const, dayOfMonth: d.dayOfMonth };
  return { ...base, startDate: d.startDate, ...(d.endDate ? { endDate: d.endDate } : {}) };
}

/** "Every Mon and Thu" / "Monthly on day 15". */
export function describeRule(rule: ScheduleRule): string {
  if (rule.freq === 'weekly') {
    const days = WEEKDAYS.filter((w) => rule.weekdays?.includes(w.value)).map((w) => w.short);
    if (days.length === 0) return 'Weekly (no days picked)';
    if (days.length === 7) return 'Every day';
    return `Every ${formatList(days, { locale: 'en-IN' })}`;
  }
  return `Monthly on day ${rule.dayOfMonth ?? '?'}`;
}

/** "from 2 Nov 2026 until 31 Mar 2027" / "from 2 Nov 2026". */
export function describeRuleSpan(rule: Pick<ScheduleRule, 'startDate' | 'endDate'>): string {
  const day = (key: string): string => formatDate(`${key.slice(0, 10)}T12:00:00+05:30`);
  return rule.endDate ? `from ${day(rule.startDate)} until ${day(rule.endDate)}` : `from ${day(rule.startDate)}`;
}
