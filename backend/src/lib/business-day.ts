/**
 * Which day is it, for attendance purposes?
 *
 * Every attendance row is keyed by a `date` "day label" stored at UTC
 * midnight. Deciding *which* day a punch belongs to used to be done with
 * `new Date().setHours(0,0,0,0)` — server-local time. The server runs UTC
 * while the company works in IST, so the attendance day ran 05:30 IST →
 * 05:30 IST: anything punched between midnight and 05:30 IST was filed
 * against the PREVIOUS day. People arriving early then hit "Already checked
 * in/out today" against yesterday's finished row.
 *
 * These helpers resolve the calendar date in the *business* timezone and
 * return it as the same UTC-midnight label the database already uses.
 *
 * Deliberately label-compatible with the old behaviour: for any punch between
 * 05:30 and 23:59 IST the result is byte-identical to what the old code
 * produced, so historical rows keep matching and no migration is required.
 * Only the 00:00–05:30 IST window — the broken window — changes.
 *
 * Set `TIMEZONE` to override (defaults to Asia/Kolkata), the same env var the
 * late-arrival calculation already reads.
 */

export const BUSINESS_TZ = process.env.TIMEZONE || 'Asia/Kolkata';

/** The business-timezone calendar date of `d`, as `{ year, month, day }`. */
function businessDateParts(d: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);

  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { year: get('year'), month: get('month'), day: get('day') };
}

/**
 * Day label for the business day containing `d` — UTC midnight of the
 * business-timezone calendar date. This is the value stored in and queried
 * against `Attendance.date`.
 */
export function startOfBusinessDay(d: Date = new Date()): Date {
  const { year, month, day } = businessDateParts(d);
  return new Date(Date.UTC(year, month - 1, day));
}

/** End of that same day label — for `$lte` range queries. */
export function endOfBusinessDay(d: Date = new Date()): Date {
  const start = startOfBusinessDay(d);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/** Do two instants fall on the same business day? */
export function isSameBusinessDay(a: Date, b: Date): boolean {
  return startOfBusinessDay(a).getTime() === startOfBusinessDay(b).getTime();
}

/**
 * How far `BUSINESS_TZ` is ahead of UTC at instant `at`, in minutes
 * (+330 for Asia/Kolkata).
 */
function businessOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(at);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const wallAsUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  const wholeSeconds = Math.floor(at.getTime() / 1000) * 1000;
  return Math.round((wallAsUtc - wholeSeconds) / 60_000);
}

/**
 * The instant at which the business-timezone wall clock reads `hhmm`
 * (`"HH:mm"`) on the day `dayLabel` names. `dayLabel` is a day label as
 * returned by `startOfBusinessDay` (UTC midnight of the calendar date).
 *
 * `atBusinessTime(2026-10-12T00:00Z, '19:00')` → `2026-10-12T13:30Z` in IST.
 */
export function atBusinessTime(dayLabel: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const wall = Date.UTC(
    dayLabel.getUTCFullYear(),
    dayLabel.getUTCMonth(),
    dayLabel.getUTCDate(),
    h || 0,
    m || 0,
  );
  // Read the offset at the first guess, then once more at the result so a
  // zone with DST lands on the right side of a transition. IST is fixed.
  const guess = wall - businessOffsetMinutes(new Date(wall)) * 60_000;
  return new Date(wall - businessOffsetMinutes(new Date(guess)) * 60_000);
}
