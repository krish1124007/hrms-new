import { Types } from 'mongoose';
import { z } from 'zod';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { idOf } from '../lib/access.js';
import { assertCanSeeRep, businessDayRange, dateKeySchema, employeeName, visibleRepIds, visitPin, } from '../services/location-track.service.js';
/** Most pins one map request returns. */
export const CLIENTS_MAP_LIMIT = 500;
export const VISITS_MAP_LIMIT = 1000;
const objectIdString = z
    .string()
    .refine((s) => Types.ObjectId.isValid(s) && String(new Types.ObjectId(s)) === s, 'Invalid id');
export const visitsMapQuerySchema = z.object({
    date: dateKeySchema.optional(),
    employeeId: objectIdString.optional(),
});
/** `minLng,minLat,maxLng,maxLat` (the Leaflet `toBBoxString()` order). */
const bboxSchema = z
    .string()
    .transform((s, ctx) => {
    const parts = s.split(',').map((p) => (p.trim() === '' ? Number.NaN : Number(p)));
    const [minLng, minLat, maxLng, maxLat] = parts;
    const ok = parts.length === 4 &&
        parts.every(Number.isFinite) &&
        minLng >= -180 &&
        maxLng <= 180 &&
        minLat >= -90 &&
        maxLat <= 90 &&
        minLng <= maxLng &&
        minLat <= maxLat;
    if (!ok) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'bbox must be minLng,minLat,maxLng,maxLat',
        });
        return z.NEVER;
    }
    return { minLng, minLat, maxLng, maxLat };
});
export const clientsMapQuerySchema = z.object({
    bbox: bboxSchema.optional(),
});
/**
 * `GET /field/visits/map?date=YYYY-MM-DD&employeeId=` — visits checked in on
 * that IST day (default today) that have a location, for the reps the caller
 * may see (`employeeId` narrows to one; 403 when that rep is not visible).
 * Each pin: `{ visitId, employeeId, employeeName, clientId, clientName, lat,
 * lng, checkInAt, checkOutAt, status, purpose }`. At most 1 000, `truncated`
 * says whether more exist.
 */
export async function visitsMap(req, res) {
    const q = req.query;
    const { date, from, to } = businessDayRange(q.date);
    const filter = { 'checkIn.time': { $gte: from, $lt: to } };
    if (q.employeeId) {
        await assertCanSeeRep(req, q.employeeId);
        filter.employeeId = new Types.ObjectId(q.employeeId);
    }
    else {
        const ids = await visibleRepIds(req);
        if (ids)
            filter.employeeId = { $in: ids };
    }
    const visits = await Visit.find(filter)
        .sort({ 'checkIn.time': 1 })
        .limit(VISITS_MAP_LIMIT + 1)
        .select('employeeId clientId checkIn checkOut status purpose')
        .populate('clientId', 'name location')
        .populate('employeeId', 'firstName lastName')
        .lean()
        .exec();
    const pins = visits
        .slice(0, VISITS_MAP_LIMIT)
        .map((v) => {
        const rep = v.employeeId;
        return { ...visitPin(v), employeeName: employeeName(rep) || null };
    })
        .filter((p) => p.lat !== null && p.lng !== null);
    res.json({ success: true, data: pins, date, truncated: visits.length > VISITS_MAP_LIMIT });
}
/**
 * `GET /field/clients/map?bbox=minLng,minLat,maxLng,maxLat` — clients with a
 * location inside the box (every located client without `bbox`), by name, at
 * most 500: `{ _id, name, category, status, lat, lng, address, assignedTo:
 * { _id, firstName, lastName } | null, lastVisitDate }`; `truncated` says
 * whether more exist.
 */
export async function clientsMap(req, res) {
    // Validated (and `bbox` parsed into numbers) by `validate(clientsMapQuerySchema, 'query')`.
    const { bbox } = req.query;
    const filter = bbox
        ? {
            'location.coordinates.0': { $gte: bbox.minLng, $lte: bbox.maxLng },
            'location.coordinates.1': { $gte: bbox.minLat, $lte: bbox.maxLat },
        }
        : { 'location.coordinates.1': { $exists: true } };
    const docs = await Client.find(filter)
        .sort({ name: 1, _id: 1 })
        .limit(CLIENTS_MAP_LIMIT + 1)
        .select('name category status location address assignedTo lastVisitDate')
        .populate('assignedTo', 'firstName lastName')
        .lean()
        .exec();
    const pins = docs.slice(0, CLIENTS_MAP_LIMIT).map((c) => {
        const rep = c.assignedTo;
        return {
            _id: String(c._id),
            name: c.name,
            category: c.category,
            status: c.status,
            lat: c.location?.coordinates?.[1] ?? null,
            lng: c.location?.coordinates?.[0] ?? null,
            address: c.address ?? null,
            assignedTo: rep
                ? { _id: idOf(rep), firstName: rep.firstName ?? '', lastName: rep.lastName ?? '' }
                : null,
            lastVisitDate: c.lastVisitDate ?? null,
        };
    });
    res.json({ success: true, data: pins, truncated: docs.length > CLIENTS_MAP_LIMIT });
}
//# sourceMappingURL=field-map.controller.js.map