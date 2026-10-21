import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { LocationTrack, type ILocationGeo } from '../models/location-track.model.js';
import { Employee } from '../models/employee.model.js';
import { Visit } from '../models/visit.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { idOf } from '../lib/access.js';
import {
  LIVE_WINDOW_MS,
  assertCanSeeRep,
  businessDayRange,
  dateKeySchema,
  employeeName,
  openVisitSince,
  recordLocationBatch,
  trackingBatchSchema,
  visibleRepIds,
  visitPin,
  type TrackingBatch,
  type VisitLike,
} from '../services/location-track.service.js';

/** Most fixes one trail returns — a day at the 30 s minimum interval is 2 880. */
const TRAIL_MAX_POINTS = 5000;

/** The one ingest schema, shared with `POST /attendance/tracking/batch`. */
export const batchSchema = trackingBatchSchema;

export const trailQuerySchema = z.object({
  date: dateKeySchema.optional(),
});

/**
 * `POST /field/tracking/batch` (and `POST /attendance/tracking/batch`) —
 * consented + clocked-in gate, store, broadcast; see
 * `services/location-track.service.ts`. 201 `{ ingested }`.
 */
export async function ingestBatch(req: Request, res: Response): Promise<void> {
  const body = req.body as TrackingBatch;
  const ingested = await recordLocationBatch(req, body.points);
  res.status(201).json({ success: true, data: { ingested } });
}

interface LatestFix {
  _id: Types.ObjectId;
  timestamp: Date;
  location: ILocationGeo;
  accuracy?: number;
  speed?: number;
  heading?: number;
  battery?: number;
}

/**
 * `GET /field/tracking/live` — each visible rep's newest fix of the last 2 h:
 * `{ employeeId, employeeCode, name, avatar, lat, lng, accuracy, speed,
 * heading, battery, recordedAt, onVisit: { visitId, clientId, clientName } | null }`.
 */
export async function liveTracking(req: Request, res: Response): Promise<void> {
  const now = new Date();
  const ids = await visibleRepIds(req);
  const match: Record<string, unknown> = {
    timestamp: { $gte: new Date(now.getTime() - LIVE_WINDOW_MS) },
  };
  if (ids) match.employeeId = { $in: ids };

  const fixes = await LocationTrack.aggregate<LatestFix>([
    { $match: match },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$employeeId',
        timestamp: { $first: '$timestamp' },
        location: { $first: '$location' },
        accuracy: { $first: '$accuracy' },
        speed: { $first: '$speed' },
        heading: { $first: '$heading' },
        battery: { $first: '$battery' },
      },
    },
  ]);
  const repIds = fixes.map((f) => f._id);

  const [employees, openVisits] = await Promise.all([
    Employee.find({ _id: { $in: repIds } })
      .select('firstName lastName profileImage employeeId')
      .lean()
      .exec(),
    Visit.find({
      employeeId: { $in: repIds },
      'checkIn.time': { $gte: openVisitSince(now) },
      'checkOut.time': null,
      status: { $ne: 'cancelled' },
    })
      .sort({ 'checkIn.time': -1 })
      .select('employeeId clientId checkIn')
      .populate('clientId', 'name')
      .lean()
      .exec(),
  ]);
  const byId = new Map(employees.map((e) => [String(e._id), e]));
  const visitOf = new Map<string, (typeof openVisits)[number]>();
  for (const v of openVisits) {
    const key = String(v.employeeId);
    if (!visitOf.has(key)) visitOf.set(key, v); // newest first
  }

  const rows = fixes.flatMap((f) => {
    const emp = byId.get(String(f._id));
    if (!emp) return []; // employee since deleted
    const visit = visitOf.get(String(f._id));
    const client = visit?.clientId as unknown as { _id: Types.ObjectId; name?: string } | null;
    return [
      {
        employeeId: String(f._id),
        employeeCode: emp.employeeId ?? null,
        name: employeeName(emp),
        avatar: emp.profileImage ?? null,
        lat: f.location.coordinates[1],
        lng: f.location.coordinates[0],
        accuracy: f.accuracy ?? null,
        speed: f.speed ?? null,
        heading: f.heading ?? null,
        battery: f.battery ?? null,
        recordedAt: f.timestamp,
        onVisit: visit
          ? {
              visitId: String(visit._id),
              clientId: idOf(client),
              clientName: client?.name ?? null,
            }
          : null,
      },
    ];
  });
  rows.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, data: rows });
}

/**
 * `GET /field/tracking/:employeeId/trail?date=YYYY-MM-DD` (also the older
 * `GET /field/tracking/history/:employeeId`) — the rep's fixes on that IST
 * day, oldest first, and that day's visits (by check-in time). Default: today.
 */
export async function trackingTrail(req: Request, res: Response): Promise<void> {
  const employeeId = String(req.params.employeeId);
  if (!Types.ObjectId.isValid(employeeId) || String(new Types.ObjectId(employeeId)) !== employeeId) {
    throw new ValidationAppError('Invalid employee id');
  }
  await assertCanSeeRep(req, employeeId);
  const { date, from, to } = businessDayRange(
    (req.query as z.infer<typeof trailQuerySchema>).date,
  );

  const employee = await Employee.findById(employeeId)
    .select('firstName lastName profileImage')
    .lean()
    .exec();
  if (!employee) throw new NotFoundError('Employee not found');

  const [fixes, visits] = await Promise.all([
    LocationTrack.find({ employeeId, timestamp: { $gte: from, $lt: to } })
      .sort({ timestamp: 1 })
      .limit(TRAIL_MAX_POINTS + 1)
      .select('timestamp location accuracy speed heading')
      .lean()
      .exec(),
    Visit.find({ employeeId, 'checkIn.time': { $gte: from, $lt: to } })
      .sort({ 'checkIn.time': 1 })
      .select('employeeId clientId checkIn checkOut status purpose')
      .populate('clientId', 'name location')
      .lean()
      .exec(),
  ]);

  const points = fixes.slice(0, TRAIL_MAX_POINTS);
  res.json({
    success: true,
    data: {
      employeeId,
      name: employeeName(employee),
      avatar: employee.profileImage ?? null,
      date,
      points: points.map((p) => ({
        lat: p.location.coordinates[1],
        lng: p.location.coordinates[0],
        accuracy: p.accuracy ?? null,
        speed: p.speed ?? null,
        heading: p.heading ?? null,
        recordedAt: p.timestamp,
      })),
      truncated: fixes.length > TRAIL_MAX_POINTS,
      visits: visits.map((v) => visitPin(v as unknown as VisitLike)),
    },
  });
}
