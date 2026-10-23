/**
 * Small shared pieces of the field controllers: IST day/month windows,
 * query-string parsing (ids, date bounds, sort keys), money rounding and
 * great-circle distance.
 */
import { z } from 'zod';
import { Types } from 'mongoose';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from './business-day.js';
/* ── Business-day (IST) windows ── */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** `[start, end)` instants of the business (IST) day containing `d`. */
export function businessDayWindow(d = new Date()) {
    const start = atBusinessTime(startOfBusinessDay(d), '00:00');
    return { start, end: new Date(start.getTime() + DAY_MS) };
}
/** `[start, end)` instants of the IST calendar day `ymd` (`YYYY-MM-DD`). */
export function businessDateWindow(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const start = atBusinessTime(new Date(Date.UTC(y, m - 1, d)), '00:00');
    return { start, end: new Date(start.getTime() + DAY_MS) };
}
/** `[start, end)` instants of IST calendar month `month` (1–12) of `year`. */
export function businessMonthWindow(year, month) {
    return {
        start: atBusinessTime(new Date(Date.UTC(year, month - 1, 1)), '00:00'),
        end: atBusinessTime(new Date(Date.UTC(year, month, 1)), '00:00'),
    };
}
/** The IST `{ year, month }` of `d`. */
export function businessYearMonth(d = new Date()) {
    const label = startOfBusinessDay(d);
    return { year: label.getUTCFullYear(), month: label.getUTCMonth() + 1 };
}
/**
 * A `?date=` value: a `YYYY-MM-DD` string names an IST calendar day; anything
 * else parseable names the IST day it falls on; missing/invalid → today.
 */
export function windowForDateParam(value) {
    if (typeof value === 'string' && YMD.test(value))
        return businessDateWindow(value);
    if (typeof value === 'string' && value) {
        const d = new Date(value);
        if (!Number.isNaN(d.getTime()))
            return businessDayWindow(d);
    }
    return businessDayWindow();
}
/* ── Query parsing ── */
export const objectIdString = z
    .string()
    .trim()
    .refine((v) => Types.ObjectId.isValid(v) && /^[a-f\d]{24}$/i.test(v), 'Invalid id');
/**
 * A `?from=` / `?to=` bound. `YYYY-MM-DD` is an IST calendar day (`from` = its
 * first instant, `to` = the first instant of the next day, used with `$lt`);
 * a full timestamp is taken as given (`to` made exclusive by +1 ms).
 */
export function dateBound(edge) {
    return z.string().trim().transform((value, ctx) => {
        if (YMD.test(value)) {
            const { start, end } = businessDateWindow(value);
            return edge === 'from' ? start : end;
        }
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid date' });
            return z.NEVER;
        }
        return edge === 'from' ? d : new Date(d.getTime() + 1);
    });
}
/** `{ $gte: from, $lt: to }` for whichever bounds are present, or undefined. */
export function rangeFilter(from, to) {
    if (!from && !to)
        return undefined;
    const range = {};
    if (from)
        range.$gte = from;
    if (to)
        range.$lt = to;
    return range;
}
/** `?sort=` restricted to `fields`, ascending or (`-field`) descending. */
export function sortParam(fields) {
    const allowed = fields.flatMap((f) => [f, `-${f}`]);
    return z.string().refine((v) => allowed.includes(v), `sort must be one of: ${allowed.join(', ')}`);
}
/** `?limit=` — the global guard already clamps to 100; this keeps the schema honest. */
export const pageParams = {
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
};
/** Escape user text for a literal `$regex` match (no ReDoS, no operators) — the shared helper. */
export { escapeRegex } from './regex.js';
/**
 * An update body as a Mongo update: `null` clears a field (`$unset`),
 * `undefined` leaves it alone, anything else is `$set`. Update schemas accept
 * `null` only for the optional fields that may be cleared.
 */
export function setAndUnset(body) {
    const $set = {};
    const $unset = {};
    for (const [key, value] of Object.entries(body)) {
        if (value === null)
            $unset[key] = '';
        else if (value !== undefined)
            $set[key] = value;
    }
    // An empty operator is an error on older MongoDB servers: leave it out.
    const update = {};
    if (Object.keys($set).length > 0)
        update.$set = $set;
    if (Object.keys($unset).length > 0)
        update.$unset = $unset;
    return Object.keys(update).length > 0 ? update : { $set };
}
/* ── Money and geometry ── */
/** Round to paise. */
export function roundMoney(n) {
    return Math.round((n + Number.EPSILON) * 100) / 100;
}
/** Great-circle distance in metres between two `{ lat, lng }` points. */
export function distanceMeters(a, b) {
    const R = 6_371_000;
    const rad = (deg) => (deg * Math.PI) / 180;
    const dLat = rad(b.lat - a.lat);
    const dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
/** `[lng, lat]` GeoJSON coordinates as `{ lat, lng }`; null when absent or the 0,0 placeholder. */
export function pointOf(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length < 2)
        return null;
    const [lng, lat] = coordinates.map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0))
        return null;
    return { lat, lng };
}
//# sourceMappingURL=field-utils.js.map