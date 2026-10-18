/**
 * Worked-hours maths, the shift that governs a day and the rules derived
 * from both — shared by check-in, check-out, HR corrections and the nightly
 * day-close so all of them judge a day the same way.
 *
 * `totalWorkingHours` is only persisted at check-out, so an in-progress day
 * reads back as 0. `computeHours` derives the figure from the timestamps
 * instead, so a day in progress reports the hours worked so far.
 */
import { Types } from 'mongoose';
import { Shift } from '../models/shift.model.js';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from './business-day.js';
const ms = (v) => v ? new Date(v).getTime() : null;
/** Worked milliseconds between check-in and `until`, minus break time. */
function workedMs(att, until) {
    const inMs = ms(att.checkIn?.time);
    if (inMs === null)
        return 0;
    const outMs = ms(att.checkOut?.time) ?? until.getTime();
    const breakMs = (att.breaks ?? []).reduce((acc, b) => {
        const start = ms(b.startTime);
        if (start === null)
            return acc;
        // An open break is still running — count it up to `until`, otherwise a
        // check-out taken mid-break silently credited the whole break as work.
        const end = ms(b.endTime) ?? Math.min(outMs, until.getTime());
        return acc + Math.max(0, end - start);
    }, 0);
    return Math.max(0, outMs - inMs - breakMs);
}
/**
 * Worked hours up to `at` (or up to the check-out, when there is one), minus
 * breaks, rounded to 2 decimals — the unit `totalWorkingHours` uses.
 */
export function computeHours(att, at) {
    return +(workedMs(att, at) / 3_600_000).toFixed(2);
}
// ─── Shifts ──────────────────────────────────────────────────────────────
const MINUTE_MS = 60_000;
/** `HH:mm` as minutes after midnight, or null when malformed. */
function clockMinutes(hhmm) {
    const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? '');
    if (!m)
        return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}
/**
 * Whether a shift runs past midnight — flagged as a night shift, or ending
 * at an earlier clock time than it starts. Such a shift's day ends on the
 * next calendar day.
 */
export function isOvernightShift(shift) {
    if (!shift)
        return false;
    if (shift.isNightShift === true)
        return true;
    const start = clockMinutes(shift.startTime);
    const end = clockMinutes(shift.endTime);
    return start !== null && end !== null && end < start;
}
/**
 * The instants a shift starts and ends for the business day `day` (a day
 * label, see `lib/business-day.ts`). An `endTime` earlier than `startTime`
 * (22:00 → 06:00) ends on the next day. Null when the shift has no usable
 * times.
 */
export function shiftWindow(day, shift) {
    if (!shift)
        return null;
    const start = clockMinutes(shift.startTime);
    const end = clockMinutes(shift.endTime);
    if (start === null || end === null)
        return null;
    const endDay = end < start ? new Date(day.getTime() + DAY_MS) : day;
    return { start: atBusinessTime(day, shift.startTime), end: atBusinessTime(endDay, shift.endTime) };
}
/**
 * The day label a check-in at `at` is filed under: the business day it falls
 * on — except inside the tail of an overnight shift that began the evening
 * before (a 22:00 → 06:00 shift punched at 00:30), which belongs to that
 * evening's day, so a late arrival does not open a row for the wrong night.
 */
export function attendanceDayFor(at, shift) {
    const today = startOfBusinessDay(at);
    if (!isOvernightShift(shift))
        return today;
    const yesterday = new Date(today.getTime() - DAY_MS);
    const window = shiftWindow(yesterday, shift);
    return window && at.getTime() < window.end.getTime() ? yesterday : today;
}
/**
 * How long after an overnight shift's end its open row still counts as the
 * running day — the employee can check out, take a break, see live hours.
 * Staying on past a night shift is routine; `graceMinutes` is a lateness
 * tolerance, not an overtime allowance.
 */
export const OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS = 6;
/**
 * Until when an open overnight row of business day `day` is still the day in
 * progress: shift end + `OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS`. Past it the row
 * is a forgotten check-out — no punch closes it (a punch the next evening
 * would record a 24-hour day); the nightly day-close does, at shift end +
 * grace. Null when the shift has no usable times.
 */
export function shiftDeadline(day, shift) {
    const window = shiftWindow(day, shift);
    return window ? new Date(window.end.getTime() + OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS * 60 * MINUTE_MS) : null;
}
/**
 * Whether a row is a day still in progress at `now`: checked in, not out,
 * and either on today's business day, or — on an overnight shift — on an
 * earlier day whose shift has not reached `shiftDeadline` yet (a 22:00 →
 * 06:00 shift until 12:00). Anything else open is a forgotten check-out: it
 * must not report hours growing without bound (a day missed in August once
 * reported 44.67 h and climbing) nor be closed by a punch hours later.
 */
export function isRowInProgress(att, shift, now) {
    if (!att.checkIn?.time || att.checkOut?.time)
        return false;
    const day = startOfBusinessDay(new Date(att.date ?? att.checkIn.time));
    const today = startOfBusinessDay(now);
    if (day.getTime() === today.getTime())
        return true;
    if (day.getTime() > today.getTime() || !isOvernightShift(shift))
        return false;
    const deadline = shiftDeadline(day, shift);
    return deadline !== null && now.getTime() <= deadline.getTime();
}
/**
 * The shift that governs an employee's day: their own (populated, or loaded
 * by id), else the company default shift (`isDefault: true`), else none.
 * A soft-deleted assigned shift falls through to the default. Pass
 * `defaultShift` when it is already loaded (batch callers) to skip that query.
 */
export async function resolveShift(employee, opts = {}) {
    const assigned = employee?.shift;
    if (assigned && typeof assigned === 'object' && !(assigned instanceof Types.ObjectId)) {
        return assigned; // populated
    }
    if (assigned) {
        const doc = await Shift.findById(assigned).exec();
        if (doc)
            return doc;
    }
    if ('defaultShift' in opts)
        return opts.defaultShift ?? null;
    return Shift.findOne({ isDefault: true }).exec();
}
// ─── Day rules ───────────────────────────────────────────────────────────
/** Whole minutes in `ms`, never negative. */
const wholeMinutes = (ms) => Math.max(0, Math.floor(ms / MINUTE_MS));
/** A row an approved leave stamped (see `services/leave-attendance.service.ts`). */
const hasLeaveStamp = (att) => att.leaveRequestId != null || att.isPaidLeave != null;
/**
 * Judge a day from scratch — the same verdict for check-in, check-out, HR
 * corrections and day-close, however often it is re-run. Reads the punches,
 * `date` and (for the hours rules) `totalWorkingHours`, which the caller sets
 * first via `computeHours`. On the row's business day, in business time:
 *
 *   • `lateBy` = minutes the check-in is past shift start + `graceMinutes`
 *     (0 without a shift: there is no start to be late for);
 *   • `earlyLeaveBy` = minutes the check-out is before shift end (0 without a
 *     shift or a check-out). An overnight shift ends on the next day;
 *   • `overtimeHours` beyond `fullDayHours` of the shift, else beyond the
 *     configured `overtimeThresholdMinutes` (0 until checked out);
 *   • `status`: a leave-stamped row keeps its leave status; otherwise
 *     `half_day` when checked out under the shift's `halfDayHours` (else the
 *     configured `halfDayThresholdHours`), else `late` when `lateBy > 0`,
 *     else `present`. Half day wins over late: a short day is a short day.
 *
 * Rows without a check-in are left as they are. Mutates `att`; the caller saves it.
 */
export function applyShiftRules(att, shift, cfg) {
    const inAt = att.checkIn?.time ? new Date(att.checkIn.time) : null;
    if (!inAt)
        return;
    const outAt = att.checkOut?.time ? new Date(att.checkOut.time) : null;
    // Normalising also reads a label stored at IST midnight as the day it names.
    const day = startOfBusinessDay(att.date ? new Date(att.date) : inAt);
    const window = shiftWindow(day, shift);
    const graceMin = shift?.graceMinutes ?? cfg?.settings.lateMarkAfterMinutes ?? 15;
    att.lateBy = window ? wholeMinutes(inAt.getTime() - window.start.getTime() - graceMin * MINUTE_MS) : 0;
    att.earlyLeaveBy = window && outAt ? wholeMinutes(window.end.getTime() - outAt.getTime()) : 0;
    const otThresholdMin = shift?.fullDayHours != null ? shift.fullDayHours * 60 : (cfg?.settings.overtimeThresholdMinutes ?? 540);
    const workMin = att.totalWorkingHours * 60;
    att.overtimeHours = outAt && workMin > otThresholdMin ? +((workMin - otThresholdMin) / 60).toFixed(2) : 0;
    if (hasLeaveStamp(att))
        return;
    const halfDayHours = shift?.halfDayHours ?? cfg?.settings.halfDayThresholdHours ?? 4;
    if (outAt && att.totalWorkingHours < halfDayHours)
        att.status = 'half_day';
    else if (att.lateBy > 0)
        att.status = 'late';
    else
        att.status = 'present';
}
//# sourceMappingURL=attendance-hours.js.map