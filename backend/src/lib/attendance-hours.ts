/**
 * Worked-hours maths and the rules derived from it, shared by self-service
 * check-out, HR corrections and the nightly day-close so all of them judge a
 * day the same way.
 *
 * `totalWorkingHours` is only persisted at check-out, so an in-progress day
 * reads back as 0. `computeHours` derives the figure from the timestamps
 * instead, so a day in progress reports the hours worked so far.
 */
import type { IAttendance } from '../models/attendance.model.js';
import type { IAttendanceConfig } from '../models/attendance-config.model.js';
import type { IShift } from '../models/shift.model.js';

interface BreakLike {
  startTime?: Date | string | null;
  endTime?: Date | string | null;
}
export interface WorkedHoursSource {
  date?: Date | string | null;
  checkIn?: { time?: Date | string | null } | null;
  checkOut?: { time?: Date | string | null } | null;
  breaks?: BreakLike[];
  totalWorkingHours?: number;
}

const ms = (v?: Date | string | null): number | null =>
  v ? new Date(v).getTime() : null;

/** Worked milliseconds between check-in and `until`, minus break time. */
function workedMs(att: WorkedHoursSource, until: Date): number {
  const inMs = ms(att.checkIn?.time);
  if (inMs === null) return 0;
  const outMs = ms(att.checkOut?.time) ?? until.getTime();
  const breakMs = (att.breaks ?? []).reduce((acc, b) => {
    const start = ms(b.startTime);
    if (start === null) return acc;
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
export function computeHours(att: WorkedHoursSource, at: Date): number {
  return +(workedMs(att, at) / 3_600_000).toFixed(2);
}

/**
 * Apply the day rules to a row whose `totalWorkingHours` is already set:
 *   • overtime beyond `overtimeThresholdMinutes` (default 540);
 *   • `half_day` when the hours fall short of the shift's half-day hours,
 *     falling back to the configured threshold (default 4).
 * Mutates `att`; the caller saves it.
 */
export function applyShiftRules(
  att: IAttendance,
  shift: IShift | null,
  cfg: IAttendanceConfig | null,
): void {
  const otThresholdMin = cfg?.settings.overtimeThresholdMinutes ?? 540;
  const halfDayHours = shift?.halfDayHours ?? cfg?.settings.halfDayThresholdHours ?? 4;

  const workMin = att.totalWorkingHours * 60;
  att.overtimeHours = workMin > otThresholdMin ? +((workMin - otThresholdMin) / 60).toFixed(2) : 0;
  if (att.totalWorkingHours < halfDayHours) {
    att.status = 'half_day';
  }
}

/**
 * Whether a shift runs past midnight — flagged as a night shift, or ending
 * at an earlier clock time than it starts (`HH:mm` compares as a string).
 * Such a shift's day ends on the next calendar day.
 */
export function isOvernightShift(
  shift: Pick<IShift, 'isNightShift' | 'startTime' | 'endTime'> | null | undefined,
): boolean {
  if (!shift) return false;
  if (shift.isNightShift === true) return true;
  return Boolean(shift.startTime && shift.endTime && shift.endTime < shift.startTime);
}
