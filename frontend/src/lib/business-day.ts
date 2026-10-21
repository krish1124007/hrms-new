/**
 * Calendar days the way the API counts them: in the business timezone
 * (`Asia/Kolkata`, the backend's `lib/business-day.ts`), whatever the
 * browser's own timezone.
 */
export const BUSINESS_TIMEZONE = 'Asia/Kolkata';

/** IST is UTC+05:30 all year (India has no daylight saving). */
const BUSINESS_UTC_OFFSET = '+05:30';

const keyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * `YYYY-MM-DD` of the business day an instant falls on. Day labels stored as
 * UTC midnight (`2026-10-20T00:00:00Z`) and as IST midnight
 * (`2026-10-19T18:30:00Z`) both map to `2026-10-20`.
 */
export function businessDayKey(d: Date | string | number): string {
  return keyFormat.format(d instanceof Date ? d : new Date(d));
}

/** Today's business day, `YYYY-MM-DD`. */
export function todayKey(now: Date = new Date()): string {
  return businessDayKey(now);
}

/** The instant of wall-clock time `hhmm` (`HH:mm`) on business day `dayKey` (`YYYY-MM-DD`). */
export function businessInstant(dayKey: string, hhmm: string): Date {
  return new Date(`${dayKey}T${hhmm}:00${BUSINESS_UTC_OFFSET}`);
}

/* ── Day-key arithmetic ──────────────────────────────────────────────────────
 * A day key (`YYYY-MM-DD`) names a calendar day, not an instant, so the maths
 * below runs on UTC midnight of that key — never on a browser-local Date —
 * and gives the same answer in every timezone.
 */

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** The key of calendar day `day` of `month` (1-12) in `year`. */
export function dayKeyOf(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** `{ year, month (1-12), day }` of a day key. */
export function partsOfKey(key: string): { year: number; month: number; day: number } {
  const [year, month, day] = key.split('-').map(Number);
  return { year, month, day };
}

/** The key `days` calendar days after (negative: before) `key`. */
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Day of the week of a key, 0 = Sunday … 6 = Saturday. */
export function weekdayOfKey(key: string): number {
  return new Date(`${key}T00:00:00Z`).getUTCDay();
}

/** The Monday on or before `key` (weeks start on Monday). */
export function startOfWeekKey(key: string): string {
  return addDaysToKey(key, -((weekdayOfKey(key) + 6) % 7));
}

/** Number of days in `month` (1-12) of `year`. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * A month on the business calendar: the instants it starts and ends at (IST
 * midnight of the 1st → the last millisecond of the last day, so the last day
 * is included) and its first and last day keys.
 */
export function monthBoundsIST(
  year: number,
  month: number,
): { from: Date; to: Date; firstKey: string; lastKey: string } {
  const firstKey = dayKeyOf(year, month, 1);
  const lastKey = dayKeyOf(year, month, daysInMonth(year, month));
  return {
    from: businessInstant(firstKey, '00:00'),
    to: new Date(businessInstant(addDaysToKey(lastKey, 1), '00:00').getTime() - 1),
    firstKey,
    lastKey,
  };
}
