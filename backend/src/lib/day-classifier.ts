/**
 * Day classifier — the single answer to "is this a day the company works?".
 *
 * The nightly attendance job, leave stamping, payroll and the dashboard all
 * need the same verdict, so it lives here once rather than as four copies of
 * "week-off OR holiday OR not in workDays".
 *
 *   • `weekend`  — a week-off per the company rule, or a weekday outside the
 *                  shift's `workDays`.
 *   • `holiday`  — a *public* holiday that applies to the employee's
 *                  department (optional / restricted holidays are the
 *                  employee's choice and never close the office).
 *   • `working`  — everything else.
 *
 * Week-off beats holiday: a public holiday that lands on a Sunday is still a
 * weekend, so it is not counted twice and never inflates holiday pay.
 */
import type { Types } from 'mongoose';
import { Holiday } from '../models/holiday.model.js';
import { isWeekOff, toKey, type WeekOffRule } from './week-off.js';

export type DayKind = 'working' | 'weekend' | 'holiday';

/** The slice of a `Holiday` the classifier needs. */
export interface HolidayLite {
  date: Date;
  type: 'public' | 'optional' | 'restricted';
  /** Empty = applies company-wide. */
  departments: (Types.ObjectId | string)[];
}

export interface DayClassifierContext {
  /** Shift work days, 0=Sun..6=Sat. A weekday not listed here is a weekend. */
  workDays: number[];
  weekOffRule: WeekOffRule;
  holidays: HolidayLite[];
  /** The employee's department; `null`/absent matches company-wide holidays only. */
  departmentId?: Types.ObjectId | string | null;
}

function holidayAppliesTo(
  holiday: HolidayLite,
  departmentId: DayClassifierContext['departmentId'],
): boolean {
  if (holiday.type !== 'public') return false;
  if (!holiday.departments || holiday.departments.length === 0) return true;
  if (departmentId === null || departmentId === undefined) return false;
  const wanted = String(departmentId);
  return holiday.departments.some((d) => String(d) === wanted);
}

export function classifyDay(date: Date, ctx: DayClassifierContext): DayKind {
  if (isWeekOff(date, ctx.weekOffRule) || !ctx.workDays.includes(date.getDay())) {
    return 'weekend';
  }
  const key = toKey(date);
  for (const holiday of ctx.holidays) {
    if (toKey(new Date(holiday.date)) === key && holidayAppliesTo(holiday, ctx.departmentId)) {
      return 'holiday';
    }
  }
  return 'working';
}

/**
 * Every holiday whose date falls on a calendar day in `[start, end]`
 * (inclusive, local time) — one query, so a caller classifying a whole month
 * for many employees loads the calendar once and reuses it.
 */
export async function listHolidaysBetween(start: Date, end: Date): Promise<HolidayLite[]> {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
  const rows = await Holiday.find({ date: { $gte: from, $lte: to } })
    .select('date type departments')
    .lean()
    .exec();
  return rows.map((h) => ({
    date: h.date,
    type: h.type,
    departments: h.departments ?? [],
  }));
}
