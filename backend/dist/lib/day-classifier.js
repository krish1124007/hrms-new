import { Holiday } from '../models/holiday.model.js';
import { isWeekOff, toKey } from './week-off.js';
import { DAY_MS, startOfBusinessDay } from './business-day.js';
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
/**
 * The business-timezone calendar day (`YYYY-MM-DD`) a stored holiday date
 * names — never the server's local date: a date-only holiday stored at UTC
 * midnight (or at IST midnight) is that day in IST, while a server west of
 * UTC would read it as the day before.
 */
function holidayKey(date) {
    return startOfBusinessDay(new Date(date)).toISOString().slice(0, 10);
}
/**
 * `date` is a server-local calendar date (`localDateOf(label)` for a day
 * label); holidays are matched by the business day their stored date names.
 */
export function classifyDay(date, ctx) {
    if (isWeekOff(date, ctx.weekOffRule) || !ctx.workDays.includes(date.getDay())) {
        return 'weekend';
    }
    const key = toKey(date);
    for (const holiday of ctx.holidays) {
        if (holidayKey(holiday.date) === key && holidayAppliesTo(holiday, ctx.departmentId)) {
            return 'holiday';
        }
    }
    return 'working';
}
/**
 * Every holiday whose date names a business day in `[start, end]` — the
 * server-local calendar dates of `start` and `end`, inclusive (as
 * `classifyDay` reads them) — one query, so a caller classifying a whole
 * month for many employees loads the calendar once and reuses it.
 */
export async function listHolidaysBetween(start, end) {
    const first = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    const last = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    // Coarse ±1 day window (a date-only value may be stored at UTC or IST
    // midnight); the exact business-day test is below.
    const rows = await Holiday.find({ date: { $gte: new Date(first - DAY_MS), $lt: new Date(last + 2 * DAY_MS) } })
        .select('date type departments')
        .lean()
        .exec();
    return rows
        .filter((h) => {
        const day = startOfBusinessDay(new Date(h.date)).getTime();
        return day >= first && day <= last;
    })
        .map((h) => ({
        date: h.date,
        type: h.type,
        departments: h.departments ?? [],
    }));
}
//# sourceMappingURL=day-classifier.js.map