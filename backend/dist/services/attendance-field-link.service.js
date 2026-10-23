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
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee } from '../models/employee.model.js';
import { Visit } from '../models/visit.model.js';
import { applyShiftRules, attendanceDayFor, isRowInProgress, resolveShift } from '../lib/attendance-hours.js';
import { logger } from '../config/logger.js';
import { autoCheckoutFor, closeOpenRow } from './day-close.service.js';
const isDuplicateKey = (err) => typeof err === 'object' && err !== null && err.code === 11000;
/** The fields a close changes (plain values), for a conditional `$set`. */
function settledFields(row) {
    const o = row.toObject();
    return {
        checkOut: o.checkOut,
        breaks: o.breaks,
        source: o.source,
        status: o.status,
        lateBy: o.lateBy,
        earlyLeaveBy: o.earlyLeaveBy,
        overtimeHours: o.overtimeHours,
        totalWorkingHours: o.totalWorkingHours,
    };
}
/** The auto check-out record of a field-made day (`closeOpenRow`'s, plus the visit). */
const fieldAutoCheckOut = (out, visitId, provisional = false) => ({
    time: out,
    method: 'manual',
    metadata: {
        autoCheckout: true,
        ...(visitId ? { fieldVisitId: visitId } : {}),
        ...(provisional ? { fieldProvisional: true } : {}),
    },
});
/** The latest real (not auto-closed) visit check-out of `employeeId` on the visit day `day`. */
async function lastVisitCheckOut(employeeId, day) {
    const last = await Visit.findOne({
        employeeId,
        day,
        status: 'completed',
        'flags.autoClosed': { $ne: true },
        'checkOut.time': { $ne: null },
    })
        .sort({ 'checkOut.time': -1 })
        .select('checkOut.time')
        .lean()
        .exec();
    return last?.checkOut?.time ?? null;
}
/**
 * A field-made check-in on a day that is over: close it now, as the
 * day-close would have (that run is past). No-op when the row is still the
 * day in progress, already closed, or its check-out time has not come yet.
 */
async function closeIfDayOver(attendanceId, shift, cfg, visitId, now) {
    const row = await Attendance.findById(attendanceId).exec();
    const inAt = row?.checkIn?.time;
    if (!row || !inAt || row.checkOut?.time || isRowInProgress(row, shift, now))
        return;
    const lastOut = await lastVisitCheckOut(row.employeeId, row.date);
    const known = !!lastOut && lastOut.getTime() >= inAt.getTime();
    const out = known ? lastOut : autoCheckoutFor(row.date, inAt, shift, cfg);
    if (!out || out.getTime() > now.getTime())
        return;
    closeOpenRow(row, out, shift, cfg);
    row.checkOut = fieldAutoCheckOut(out, visitId, !known);
    await Attendance.updateOne({ _id: row._id, 'checkOut.time': null }, { $set: settledFields(row) }).exec();
}
/**
 * Make sure `employeeId` has an attendance check-in on the business day of
 * `at` (overnight shifts: the day their shift began). Creates one at `at`
 * when there is none, unless the attendance rules need a location or photo
 * the visit does not have (`skipped`); returns whether it did. A day that is
 * already over is closed at once (see the header).
 */
export async function ensureDayCheckIn(employeeId, at, location, source, now = new Date()) {
    const employee = await Employee.findById(employeeId).select('shift requireLocation').exec();
    if (!employee)
        return { created: false };
    const [shift, cfg] = await Promise.all([resolveShift(employee), AttendanceConfig.findOne({}).exec()]);
    const day = attendanceDayFor(at, shift);
    const existing = await Attendance.findOne({ employeeId: employee._id, date: day }).exec();
    if (existing?.checkIn?.time)
        return { created: false };
    // The attendance rules (attendance.controller `checkIn`) hold for visits too.
    if ((cfg?.settings.requireLocation || employee.requireLocation) && !location) {
        return { created: false, skipped: 'location_required' };
    }
    if (cfg?.settings.requirePhotoOnCheckIn && !source.photo)
        return { created: false, skipped: 'photo_required' };
    const checkIn = {
        time: at,
        method: source.method,
        ...(location ? { location: { lat: location.lat, lng: location.lng, accuracy: location.accuracy } } : {}),
        ...(source.photo ? { photo: source.photo } : {}),
        metadata: source.visitId ? { fieldVisitId: source.visitId } : {},
    };
    let attendanceId;
    if (!existing) {
        const att = new Attendance({ employeeId: employee._id, date: day, checkIn, source: 'punch' });
        applyShiftRules(att, shift, cfg);
        try {
            await att.save();
            attendanceId = att._id;
        }
        catch (err) {
            // A punch (or a parallel visit) wrote the day first: theirs stands.
            if (isDuplicateKey(err))
                return { created: false };
            throw err;
        }
    }
    else {
        // A row without a check-in (auto-absent, leave stamp): take it over, as a punch would.
        existing.checkIn = checkIn;
        existing.source = 'punch';
        applyShiftRules(existing, shift, cfg);
        const result = await Attendance.updateOne({ _id: existing._id, 'checkIn.time': null }, {
            $set: {
                checkIn,
                source: 'punch',
                status: existing.status,
                lateBy: existing.lateBy,
                earlyLeaveBy: existing.earlyLeaveBy,
                overtimeHours: existing.overtimeHours,
            },
        }).exec();
        if (result.modifiedCount === 0) {
            logger.debug({ employeeId: String(employee._id), day }, 'field visit attendance: day already checked in');
            return { created: false };
        }
        attendanceId = existing._id;
    }
    await closeIfDayOver(attendanceId, shift, cfg, source.visitId, now);
    return { created: true, attendanceId: String(attendanceId) };
}
/**
 * A visit checked in at `visitIn` was checked out at `out`: when its
 * attendance day was closed automatically (by the day-close, or at once for
 * an offline visit) with a field check-in, the check-out moves to `out` when
 * that is later — or, while the close is still provisional (no visit
 * check-out of the day had arrived), to the day's last visit check-out
 * whether earlier or later. The day is settled again.
 */
export async function extendFieldDayCheckOut(employeeId, visitIn, out) {
    const employee = await Employee.findById(employeeId).select('shift').exec();
    if (!employee)
        return;
    const [shift, cfg] = await Promise.all([resolveShift(employee), AttendanceConfig.findOne({}).exec()]);
    const row = await Attendance.findOne({
        employeeId: new Types.ObjectId(String(employee._id)),
        date: attendanceDayFor(visitIn, shift),
        'checkIn.method': 'field_visit',
        'checkOut.metadata.autoCheckout': true,
    }).exec();
    const before = row?.checkOut?.time;
    const inAt = row?.checkIn?.time;
    if (!row || !before || !inAt)
        return;
    let target = out;
    if (row.checkOut?.metadata?.fieldProvisional) {
        const lastOut = await lastVisitCheckOut(row.employeeId, row.date);
        if (lastOut && lastOut.getTime() > target.getTime())
            target = lastOut;
        if (target.getTime() < inAt.getTime() || target.getTime() === before.getTime())
            return;
    }
    else if (before.getTime() >= target.getTime()) {
        return;
    }
    const visitId = row.checkOut?.metadata?.fieldVisitId;
    closeOpenRow(row, target, shift, cfg);
    row.checkOut = fieldAutoCheckOut(target, visitId);
    await Attendance.updateOne({ _id: row._id, 'checkOut.time': before }, { $set: settledFields(row) }).exec();
}
//# sourceMappingURL=attendance-field-link.service.js.map