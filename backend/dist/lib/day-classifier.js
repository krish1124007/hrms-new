import { Holiday } from '../models/holiday.model.js';
import { isWeekOff, toKey } from './week-off.js';
function holidayAppliesTo(holiday, departmentId) {
    if (holiday.type !== 'public')
        return false;
    if (!holiday.departments || holiday.departments.length === 0)
        return true;
    if (departmentId === null || departmentId === undefined)
        return false;
    const wanted = String(departmentId);
    return holiday.departments.some((d) => String(d) === wanted);
}
export function classifyDay(date, ctx) {
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
export async function listHolidaysBetween(start, end) {
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
//# sourceMappingURL=day-classifier.js.map