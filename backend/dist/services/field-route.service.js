/**
 * A field employee's day as a route.
 *
 * Tracking happens only at check-in/check-out points, so a day's points are:
 * the attendance day check-in, each visit's check-in and check-out, and the
 * attendance day check-out — every one that has a GPS fix, sorted by time
 * (ties keep that natural sequence). Visits count on the IST day of their
 * check-in; cancelled visits are left out.
 *
 * The legs between consecutive points are road distances from Google
 * (`googleMaps.routeDistanceMeters`); when Google is not configured or fails
 * a leg is the straight line × 1.3 and marked `estimated`. A visit's own
 * check-in → check-out leg shorter than 50 m is not travel and is skipped
 * (no leg, no Google call).
 *
 * Measured legs are kept per employee and day (`fielddayroutes`) under a
 * signature of the day's points, and reused until a new point arrives. A
 * route that had to fall back while Google is configured (a failure) is kept
 * for 10 minutes only (`retryAfter`), then Google is asked again — so a
 * failing key is not called on every team-map poll or summary.
 */
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Attendance } from '../models/attendance.model.js';
import { Visit } from '../models/visit.model.js';
import { FieldDayRoute } from '../models/field-day-route.model.js';
import { atBusinessTime, DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
import { distanceMeters } from '../lib/field-utils.js';
import { googleMaps } from './google-maps.service.js';
/** A route that fell back while Google is configured is measured again after this long. */
export const ROUTE_RETRY_AFTER_MS = 10 * 60 * 1000;
/** A visit's own check-in → check-out leg shorter than this is not travel. */
export const SAME_VISIT_MIN_LEG_M = 50;
/** Day routes measured at the same time (each asks Google for up to 4 legs at once). */
const ROUTE_CONCURRENCY = 4;
/* ── Days ── */
const YMD = /^\d{4}-\d{2}-\d{2}$/;
/** A `YYYY-MM-DD` calendar date that exists. */
export const dateKeySchema = z
    .string()
    .regex(YMD, 'Use YYYY-MM-DD')
    .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'Not a calendar date');
/** The IST day `date` names (default: today). */
export function fieldDay(date) {
    const label = date ? new Date(`${date}T00:00:00Z`) : startOfBusinessDay(new Date());
    const from = atBusinessTime(label, '00:00');
    return { date: label.toISOString().slice(0, 10), label, from, to: new Date(from.getTime() + DAY_MS) };
}
/** The IST calendar date (`YYYY-MM-DD`) an instant falls on. */
export function istDate(at) {
    return startOfBusinessDay(at).toISOString().slice(0, 10);
}
/** Calendar days from `from` to `to` inclusive (both `YYYY-MM-DD`). */
export function daysBetween(from, to) {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}
export const dayKey = (employeeId, date) => `${employeeId}|${date}`;
/** Populate for a visit's site — kept even when the site was deleted since. */
export const VISIT_SITE_POPULATE = {
    path: 'siteId',
    select: 'name type radiusM location',
    options: { withDeleted: true },
};
/**
 * The attendance rows and checked-in visits of `employeeIds` (or everybody)
 * for every IST day from `from` to `to`, one entry per employee and day
 * that has either — or, with `visitDaysOnly`, per employee and day with a
 * visit (field days; attendance-only office days are left out).
 */
export async function loadFieldDays(opts) {
    const first = fieldDay(opts.from);
    const last = fieldDay(opts.to);
    if (opts.employeeIds !== 'all' && opts.employeeIds.length === 0)
        return [];
    const who = opts.employeeIds === 'all' ? {} : { employeeId: { $in: opts.employeeIds } };
    const visits = await Visit.find({
        ...who,
        'checkIn.time': { $gte: first.from, $lt: last.to },
        status: { $ne: 'cancelled' },
    })
        .sort({ 'checkIn.time': 1, _id: 1 })
        .select('employeeId siteId purpose status plannedDate checkIn checkOut durationMinutes flags report')
        .populate(VISIT_SITE_POPULATE)
        .lean()
        .exec();
    const attendanceOf = opts.visitDaysOnly ? { employeeId: { $in: [...new Set(visits.map((v) => String(v.employeeId)))] } } : who;
    const rows = opts.visitDaysOnly && visits.length === 0
        ? []
        : await Attendance.find({ ...attendanceOf, date: { $gte: first.label, $lte: last.label } })
            .select('employeeId date checkIn.time checkIn.location checkOut.time checkOut.location')
            .lean()
            .exec();
    const days = new Map();
    const entry = (employeeId, date) => {
        const key = dayKey(employeeId, date);
        let day = days.get(key);
        if (!day) {
            day = { employeeId, date, attendance: null, visits: [] };
            days.set(key, day);
        }
        return day;
    };
    for (const row of rows) {
        const date = new Date(row.date).toISOString().slice(0, 10);
        entry(String(row.employeeId), date).attendance = { checkIn: row.checkIn ?? null, checkOut: row.checkOut ?? null };
    }
    for (const v of visits) {
        entry(String(v.employeeId), istDate(v.checkIn.time)).visits.push(v);
    }
    const all = [...days.values()];
    return opts.visitDaysOnly ? all.filter((d) => d.visits.length > 0) : all;
}
/* ── Points ── */
/** `{ lat, lng }` of a usable GPS fix, else null (absent, not finite, out of range or the 0,0 placeholder). */
export function fixOf(location) {
    const lat = Number(location?.lat);
    const lng = Number(location?.lng);
    if (location?.lat == null || location?.lng == null || !Number.isFinite(lat) || !Number.isFinite(lng))
        return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0))
        return null;
    return { lat, lng };
}
/** The day's check-in/out points with a GPS fix, sorted by time. */
export function dayPointsOf(day) {
    if (!day)
        return [];
    const natural = [];
    const push = (punch, kind, visit) => {
        const fix = fixOf(punch?.location);
        if (!punch?.time || !fix)
            return;
        natural.push({
            ...fix,
            at: new Date(punch.time),
            kind,
            ...(visit ? { siteName: visit.siteId?.name ?? 'Unknown site', visitId: String(visit._id) } : {}),
        });
    };
    push(day.attendance?.checkIn, 'day_in');
    for (const visit of day.visits) {
        push(visit.checkIn, 'visit_in', visit);
        push(visit.checkOut, 'visit_out', visit);
    }
    push(day.attendance?.checkOut, 'day_out');
    return natural
        .map((point, index) => ({ point, index }))
        .sort((a, b) => a.point.at.getTime() - b.point.at.getTime() || a.index - b.index)
        .map(({ point }) => point);
}
/** A point as the API shows it: `{ lat, lng, at, kind, siteName? }`. */
export function publicPoint(p) {
    return { lat: p.lat, lng: p.lng, at: p.at, kind: p.kind, ...(p.siteName !== undefined ? { siteName: p.siteName } : {}) };
}
/** A route as the API shows it (`GET /field/route/:employeeId`). */
export function publicRoute(route) {
    return {
        date: route.date,
        points: route.points.map(publicPoint),
        legs: route.legs,
        totalKm: route.totalKm,
        estimated: route.estimated,
    };
}
/* ── Legs ── */
/** Metres → km, two decimals. */
export const metresToKm = (metres) => Math.round(metres / 10) / 100;
/** The consecutive point pairs that are travel (a visit's own leg under 50 m is not). */
export function travelSegments(points) {
    const segments = [];
    for (let i = 0; i + 1 < points.length; i += 1) {
        const a = points[i];
        const b = points[i + 1];
        const ownLeg = a.kind === 'visit_in' && b.kind === 'visit_out' && a.visitId === b.visitId;
        if (ownLeg && distanceMeters(a, b) < SAME_VISIT_MIN_LEG_M)
            continue;
        segments.push({ fromIndex: i, toIndex: i + 1 });
    }
    return segments;
}
/** Measure the travel legs between `points` (Google, or the estimate). */
export async function measureLegs(points) {
    // Contiguous runs of travel segments: one Google request batch per run.
    const runs = [];
    for (const s of travelSegments(points)) {
        const run = runs[runs.length - 1];
        if (run && run[run.length - 1] === s.fromIndex)
            run.push(s.toIndex);
        else
            runs.push([s.fromIndex, s.toIndex]);
    }
    const legs = [];
    for (const run of runs) {
        // eslint-disable-next-line no-await-in-loop
        const measured = await googleMaps.routeDistanceMeters(run.map((i) => ({ lat: points[i].lat, lng: points[i].lng })));
        for (let j = 0; j + 1 < run.length; j += 1) {
            legs.push({
                fromIndex: run[j],
                toIndex: run[j + 1],
                distanceM: Math.max(0, Math.round(measured.legsM[j] ?? 0)),
                estimated: Boolean(measured.legsEstimated[j]),
            });
        }
    }
    return legs;
}
function routeOf(date, points, legs) {
    const totalM = legs.reduce((sum, leg) => sum + leg.distanceM, 0);
    return { date, points, legs, totalKm: metresToKm(totalM), estimated: legs.some((l) => l.estimated) };
}
/** Changes whenever a point is added, removed or moved. */
function signatureOf(points) {
    const parts = points.map((p) => [p.kind, p.at.getTime(), p.lat.toFixed(6), p.lng.toFixed(6), p.visitId ?? ''].join(','));
    return createHash('sha1').update(parts.join(';')).digest('hex');
}
/** Run `fn` over `items`, `limit` at a time. */
async function mapLimit(items, limit, fn) {
    const out = new Array(items.length);
    let next = 0;
    const worker = async () => {
        while (next < items.length) {
            const i = next;
            next += 1;
            // eslint-disable-next-line no-await-in-loop
            out[i] = await fn(items[i]);
        }
    };
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return out;
}
/**
 * Day routes for many employee-days at once (keyed `employeeId|date`):
 * cached legs where the points are unchanged, measured (and cached) otherwise.
 */
export async function measureDays(days) {
    const routes = new Map();
    const toMeasure = days.filter((d) => {
        if (d.points.length >= 2)
            return true;
        routes.set(dayKey(d.employeeId, d.date), routeOf(d.date, d.points, []));
        return false;
    });
    if (toMeasure.length === 0)
        return routes;
    const ids = [...new Set(toMeasure.map((d) => d.employeeId))].map((id) => new Types.ObjectId(id));
    const dates = [...new Set(toMeasure.map((d) => d.date))];
    const cached = await FieldDayRoute.find({ employeeId: { $in: ids }, date: { $in: dates } })
        .select('employeeId date signature legs estimated retryAfter')
        .lean()
        .exec();
    const cache = new Map(cached.map((c) => [dayKey(String(c.employeeId), c.date), c]));
    const googleOn = googleMaps.isConfigured();
    await mapLimit(toMeasure, ROUTE_CONCURRENCY, async (d) => {
        const key = dayKey(d.employeeId, d.date);
        const signature = signatureOf(d.points);
        const hit = cache.get(key);
        // An estimate made while Google is configured was a failure: measure
        // again once its retry time has passed.
        const retryLater = hit?.retryAfter instanceof Date && hit.retryAfter.getTime() > Date.now();
        if (hit && hit.signature === signature && (!hit.estimated || !googleOn || retryLater)) {
            const legs = hit.legs.map((l) => ({
                fromIndex: l.fromIndex,
                toIndex: l.toIndex,
                distanceM: l.distanceM,
                estimated: Boolean(l.estimated),
            }));
            routes.set(key, routeOf(d.date, d.points, legs));
            return;
        }
        const route = routeOf(d.date, d.points, await measureLegs(d.points));
        routes.set(key, route);
        const failed = route.estimated && googleOn;
        await FieldDayRoute.updateOne({ employeeId: new Types.ObjectId(d.employeeId), date: d.date }, {
            $set: {
                signature,
                legs: route.legs,
                totalKm: route.totalKm,
                estimated: route.estimated,
                computedAt: new Date(),
                retryAfter: failed ? new Date(Date.now() + ROUTE_RETRY_AFTER_MS) : null,
            },
        }, { upsert: true })
            .exec()
            // A concurrent request stored the same day first: keep theirs.
            .catch((err) => {
            if (err?.code !== 11000)
                throw err;
        });
    });
    return routes;
}
/** One employee's day: its raw data, points and measured route. */
export async function dayRoute(employeeId, date) {
    const id = String(employeeId);
    const [found] = await loadFieldDays({ employeeIds: [new Types.ObjectId(id)], from: date, to: date });
    const data = found ?? { employeeId: id, date, attendance: null, visits: [] };
    const points = dayPointsOf(data);
    const routes = await measureDays([{ employeeId: id, date, points }]);
    return { data, route: routes.get(dayKey(id, date)) };
}
//# sourceMappingURL=field-route.service.js.map