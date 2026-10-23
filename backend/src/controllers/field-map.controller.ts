/**
 * Read-only map pins for the field web map: the day's visits. (Site pins:
 * GET /field/sites/map.)
 */
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { Visit } from '../models/visit.model.js';
import {
  assertCanSeeRep,
  businessDayRange,
  dateKeySchema,
  employeeName,
  visibleRepIds,
  visitPin,
  type VisitLike,
} from '../services/location-track.service.js';

/** Most pins one map request returns. */
export const VISITS_MAP_LIMIT = 1000;

const objectIdString = z
  .string()
  .refine((s) => Types.ObjectId.isValid(s) && String(new Types.ObjectId(s)) === s, 'Invalid id');

export const visitsMapQuerySchema = z.object({
  date: dateKeySchema.optional(),
  employeeId: objectIdString.optional(),
});

/**
 * `GET /field/visits/map?date=YYYY-MM-DD&employeeId=` — visits checked in on
 * that IST day (default today) that have a location, for the reps the caller
 * may see (`employeeId` narrows to one; 403 when that rep is not visible).
 * Each pin: `{ visitId, employeeId, employeeName, siteId, siteName, lat,
 * lng, checkInAt, checkOutAt, status, purpose }`. At most 1 000, `truncated`
 * says whether more exist.
 */
export async function visitsMap(req: Request, res: Response): Promise<void> {
  const q = req.query as z.infer<typeof visitsMapQuerySchema>;
  const { date, from, to } = businessDayRange(q.date);
  const filter: Record<string, unknown> = { 'checkIn.time': { $gte: from, $lt: to } };
  if (q.employeeId) {
    await assertCanSeeRep(req, q.employeeId);
    filter.employeeId = new Types.ObjectId(q.employeeId);
  } else {
    const ids = await visibleRepIds(req);
    if (ids) filter.employeeId = { $in: ids };
  }

  const visits = await Visit.find(filter)
    .sort({ 'checkIn.time': 1 })
    .limit(VISITS_MAP_LIMIT + 1)
    .select('employeeId siteId checkIn checkOut status purpose')
    .populate('siteId', 'name location')
    .populate('employeeId', 'firstName lastName')
    .lean()
    .exec();

  const pins = visits
    .slice(0, VISITS_MAP_LIMIT)
    .map((v) => {
      const rep = v.employeeId as unknown as { firstName?: string; lastName?: string } | null;
      return { ...visitPin(v as unknown as VisitLike), employeeName: employeeName(rep) || null };
    })
    .filter((p) => p.lat !== null && p.lng !== null);

  res.json({ success: true, data: pins, date, truncated: visits.length > VISITS_MAP_LIMIT });
}
