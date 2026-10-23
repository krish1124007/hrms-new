/**
 * Field visits count as attendance (setting `visitCountsAsAttendance`, on by
 * default): the first visit check-in of a business day becomes that day's
 * attendance check-in when the employee has none — at the visit's captured
 * time (an offline visit synced days later still marks its own day), with
 * method `field_visit` and the visit's location. An existing check-in is
 * never changed; a row the day-close or a leave stamp wrote without a
 * check-in is taken over, as a punch would (see attendance.controller
 * `checkIn`). Lateness and status follow the employee's shift rules.
 *
 * Conditional writes only (no transactions): a punch or another visit
 * racing this one wins, and this call becomes a no-op.
 */
import type { Types } from 'mongoose';
import { Attendance, type ICheckinRecord } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee } from '../models/employee.model.js';
import { applyShiftRules, attendanceDayFor, resolveShift } from '../lib/attendance-hours.js';
import { logger } from '../config/logger.js';

export interface FieldCheckInSource {
  method: 'field_visit';
  /** The visit that made the check-in. */
  visitId?: string;
}

const isDuplicateKey = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

/**
 * Make sure `employeeId` has an attendance check-in on the business day of
 * `at` (overnight shifts: the day their shift began). Creates one at `at`
 * when there is none; returns whether it did.
 */
export async function ensureDayCheckIn(
  employeeId: Types.ObjectId | string,
  at: Date,
  location: { lat: number; lng: number; accuracy?: number } | undefined,
  source: FieldCheckInSource,
): Promise<{ created: boolean; attendanceId?: string }> {
  const employee = await Employee.findById(employeeId).select('shift').exec();
  if (!employee) return { created: false };
  const [shift, cfg] = await Promise.all([resolveShift(employee), AttendanceConfig.findOne({}).exec()]);
  const day = attendanceDayFor(at, shift);

  const existing = await Attendance.findOne({ employeeId: employee._id, date: day }).exec();
  if (existing?.checkIn?.time) return { created: false };

  const checkIn: ICheckinRecord = {
    time: at,
    method: source.method,
    ...(location ? { location: { lat: location.lat, lng: location.lng, accuracy: location.accuracy } } : {}),
    metadata: source.visitId ? { fieldVisitId: source.visitId } : {},
  };

  if (!existing) {
    const att = new Attendance({ employeeId: employee._id, date: day, checkIn, source: 'punch' });
    applyShiftRules(att, shift, cfg);
    try {
      await att.save();
      return { created: true, attendanceId: String(att._id) };
    } catch (err) {
      // A punch (or a parallel visit) wrote the day first: theirs stands.
      if (isDuplicateKey(err)) return { created: false };
      throw err;
    }
  }

  // A row without a check-in (auto-absent, leave stamp): take it over, as a punch would.
  existing.checkIn = checkIn;
  existing.source = 'punch';
  applyShiftRules(existing, shift, cfg);
  const result = await Attendance.updateOne(
    { _id: existing._id, 'checkIn.time': null },
    {
      $set: {
        checkIn,
        source: 'punch',
        status: existing.status,
        lateBy: existing.lateBy,
        earlyLeaveBy: existing.earlyLeaveBy,
        overtimeHours: existing.overtimeHours,
      },
    },
  ).exec();
  if (result.modifiedCount === 0) {
    logger.debug({ employeeId: String(employee._id), day }, 'field visit attendance: day already checked in');
    return { created: false };
  }
  return { created: true, attendanceId: String(existing._id) };
}
