/**
 * Field visits count as attendance (setting `visitCountsAsAttendance`, on by
 * default): the first visit check-in of a business day becomes that day's
 * attendance check-in when the employee has none — at the visit's captured
 * time (an offline visit synced days later still marks its own day), with
 * method `field_visit`, the visit's location and selfie. An existing
 * check-in is never changed; a row the day-close or a leave stamp wrote
 * without a check-in is taken over, as a punch would (see
 * attendance.controller `checkIn`). Lateness and status follow the
 * employee's shift rules.
 *
 * The attendance rules still apply: when a location (company-wide or the
 * employee's own flag) or a photo is required for attendance and the visit
 * has no GPS fix / no selfie, nothing is linked — the employee punches, or
 * HR records the day.
 *
 * A day that is already over (an offline visit synced after that day's
 * day-close ran) is closed straight away, the way the day-close does: at the
 * day's last visit check-out when there is one, else by the auto-checkout
 * rule. That rule's time is provisional: the first visit check-out of that
 * day to arrive replaces it (earlier or later — an offline check-in usually
 * syncs just before its check-out); after that, a visit check-out only moves
 * the day's check-out forward (`extendFieldDayCheckOut`).
 *
 * Conditional writes only (no transactions): a punch or another visit
 * racing this one wins, and this call becomes a no-op.
 */
import { Types } from 'mongoose';
export interface FieldCheckInSource {
    method: 'field_visit';
    /** The visit that made the check-in. */
    visitId?: string;
    /** The visit's selfie (stored `/uploads/<key>` reference), if any. */
    photo?: string;
}
/** Why no check-in was linked although the day had none. */
export type FieldLinkSkip = 'location_required' | 'photo_required';
/**
 * Make sure `employeeId` has an attendance check-in on the business day of
 * `at` (overnight shifts: the day their shift began). Creates one at `at`
 * when there is none, unless the attendance rules need a location or photo
 * the visit does not have (`skipped`); returns whether it did. A day that is
 * already over is closed at once (see the header).
 */
export declare function ensureDayCheckIn(employeeId: Types.ObjectId | string, at: Date, location: {
    lat: number;
    lng: number;
    accuracy?: number;
} | undefined, source: FieldCheckInSource, now?: Date): Promise<{
    created: boolean;
    attendanceId?: string;
    skipped?: FieldLinkSkip;
}>;
/**
 * A visit checked in at `visitIn` was checked out at `out`: when its
 * attendance day was closed automatically (by the day-close, or at once for
 * an offline visit) with a field check-in, the check-out moves to `out` when
 * that is later — or, while the close is still provisional (no visit
 * check-out of the day had arrived), to the day's last visit check-out
 * whether earlier or later. The day is settled again.
 */
export declare function extendFieldDayCheckOut(employeeId: Types.ObjectId | string, visitIn: Date, out: Date): Promise<void>;
//# sourceMappingURL=attendance-field-link.service.d.ts.map