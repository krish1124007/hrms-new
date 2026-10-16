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
//# sourceMappingURL=business-day.d.ts.map