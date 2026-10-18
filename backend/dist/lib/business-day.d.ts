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
export declare const BUSINESS_TZ: string;
/**
 * Day label for the business day containing `d` — UTC midnight of the
 * business-timezone calendar date. This is the value stored in and queried
 * against `Attendance.date`.
 */
export declare function startOfBusinessDay(d?: Date): Date;
/** End of that same day label — for `$lte` range queries. */
export declare function endOfBusinessDay(d?: Date): Date;
/** Do two instants fall on the same business day? */
export declare function isSameBusinessDay(a: Date, b: Date): boolean;
/**
 * The instant at which the business-timezone wall clock reads `hhmm`
 * (`"HH:mm"`) on the day `dayLabel` names. `dayLabel` is a day label as
 * returned by `startOfBusinessDay` (UTC midnight of the calendar date).
 *
 * `atBusinessTime(2026-10-12T00:00Z, '19:00')` → `2026-10-12T13:30Z` in IST.
 */
export declare function atBusinessTime(dayLabel: Date, hhmm: string): Date;
/** One calendar day in milliseconds (the business timezone has no DST). */
export declare const DAY_MS: number;
/**
 * A Date whose *server-local* calendar date is the label's date (local noon),
 * for `classifyDay` / `listHolidaysBetween`, which read local `getDay()` and
 * `getDate()`. Noon keeps it on the right date whatever the server timezone.
 */
export declare function localDateOf(dayLabel: Date): Date;
/**
 * The day label of every business day from the one `start` falls on through
 * the one `end` falls on, inclusive (empty when `end` is on an earlier day).
 * Date-only values stored at UTC midnight and at IST midnight both resolve to
 * the calendar day they name.
 */
export declare function businessDayLabels(start: Date, end: Date): Date[];
//# sourceMappingURL=business-day.d.ts.map