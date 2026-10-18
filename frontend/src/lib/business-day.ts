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
