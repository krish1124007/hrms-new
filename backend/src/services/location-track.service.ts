/**
 * Live location tracking — the one ingest and the rules every tracking read
 * shares.
 *
 * Both upload URLs (`POST /field/tracking/batch` and the older
 * `POST /attendance/tracking/batch` the shipped mobile app still calls) go
 * through `recordLocationBatch`: one schema, one gate, one store, one
 * broadcast.
 *
 * The gate ("field staff, consented and clocked in"):
 *   • field staff — only employees HR has flagged `isFieldStaff` are tracked
 *     at all (holding a `field-sales.*` permission does not make anyone field
 *     staff — HR managers hold one to run the module). Otherwise 403
 *     `NOT_FIELD_STAFF`.
 *   • consent — live tracking is switched on in the attendance config
 *     (`AttendanceConfig.liveTracking.enabled`, the company's tracking
 *     policy the employee works under). Off → 403 `TRACKING_DISABLED`.
 *   • clocked in — the employee's attendance day in progress has a check-in
 *     and no check-out (today's row, or a night shift's row from yesterday
 *     still in progress — the same rule as the attendance "today" card).
 *     Otherwise 403 `NOT_CLOCKED_IN`.
 * The legacy URL answers a failed gate with 200 `{ ignored: true }` instead
 * (shipped apps poll it and must not see errors). Fixes recorded more than
 * 24 h ago are dropped from a batch, not refused with it.
 *
 * Visibility for every read: `field-sales.manage` sees every rep; anyone
 * else sees themselves and their direct reports — and only field staff's
 * fixes are ever shown (rows stored for anyone else before this gate
 * existed stay hidden).
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { logger } from '../config/logger.js';
import { LocationTrack } from '../models/location-track.model.js';
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { AppError, UnauthorizedError } from '../lib/errors.js';
import { currentEmployeeId, hasPermission, idOf } from '../lib/access.js';
import { directReportIds } from '../lib/approvals.js';
import { DAY_MS, atBusinessTime, startOfBusinessDay } from '../lib/business-day.js';
import { isRowInProgress, resolveShift } from '../lib/attendance-hours.js';
import { getIO } from '../sockets/io-registry.js';
import {
  FIELD_TRACKING_NAMESPACE,
  LOCATION_UPDATE_EVENT,
  MANAGERS_ROOM,
  reportsRoom,
} from '../sockets/field-tracking.socket.js';

const HOUR_MS = 60 * 60 * 1000;

export const MAX_POINTS_PER_BATCH = 200;
/** Fixes recorded longer ago than this are dropped from the batch (not stored). */
export const MAX_POINT_AGE_MS = DAY_MS;
/** The live map shows each rep's newest fix of this window. */
export const LIVE_WINDOW_MS = 2 * HOUR_MS;
/** An open visit checked in longer ago than this is a forgotten check-out, not "on a visit". */
const OPEN_VISIT_MAX_MS = 12 * HOUR_MS;
/** How far back a night shift's open check-in can be (same as attendance check-out). */
const OPEN_PUNCH_LOOKBACK_MS = 36 * HOUR_MS;

const MANAGE = 'field-sales.manage';

// ─── Request schema ───────────────────────────────────────────────────────

/** React Native reports an unknown speed/heading/altitude as `null`: read it as absent. */
const blankToUndefined = (v: unknown): unknown => (v === null || v === '' ? undefined : v);
const optionalNumber = z.preprocess(blankToUndefined, z.coerce.number().finite().optional());
/** Required: a missing or `null` value fails ("received nan") instead of reading as 0. */
const number = (min: number, max: number) =>
  z.preprocess(blankToUndefined, z.coerce.number().min(min).max(max));

const pointSchema = z
  .object({
    lat: number(-90, 90),
    lng: number(-180, 180),
    /** Metres. */
    accuracy: number(0, Number.MAX_SAFE_INTEGER),
    speed: optionalNumber,
    heading: optionalNumber,
    altitude: optionalNumber,
    /** When the device took the fix. */
    recordedAt: z.preprocess(blankToUndefined, z.coerce.date().optional()),
    /** The shipped mobile app's name for `recordedAt`. */
    timestamp: z.preprocess(blankToUndefined, z.coerce.date().optional()),
    activity: z.enum(['still', 'walking', 'running', 'in_vehicle']).optional(),
    battery: optionalNumber,
    isCharging: z.boolean().optional(),
    networkType: z.string().max(32).optional(),
    isOffline: z.boolean().optional(),
  })
  .transform((p, ctx) => {
    const { timestamp, recordedAt, ...rest } = p;
    const at = recordedAt ?? timestamp;
    if (!at) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recordedAt'], message: 'Required' });
      return z.NEVER;
    }
    return { ...rest, recordedAt: at };
  });

/**
 * `{ points: [{ lat, lng, accuracy, speed?, heading?, recordedAt }] }`, 1–200
 * points. `timestamp` is accepted for `recordedAt` (older clients). Points
 * recorded more than 24 h ago are dropped at ingest — a phone that was
 * offline for a day still delivers the rest of its queue.
 */
export const trackingBatchSchema = z.object({
  points: z.array(pointSchema).min(1).max(MAX_POINTS_PER_BATCH),
});

export type TrackingBatch = z.output<typeof trackingBatchSchema>;
export type TrackingPoint = TrackingBatch['points'][number];

// ─── Gate ─────────────────────────────────────────────────────────────────

interface TrackedEmployee {
  _id: Types.ObjectId;
  firstName?: string;
  lastName?: string;
  profileImage?: string;
  reportingManager?: Types.ObjectId | null;
  shift?: unknown;
  isFieldStaff?: boolean;
}

/** The 403 codes of the tracking gate — the legacy URL answers these with 200 `{ ignored: true }`. */
export const TRACKING_GATE_CODES: ReadonlySet<string> = new Set([
  'NOT_FIELD_STAFF',
  'TRACKING_DISABLED',
  'NOT_CLOCKED_IN',
]);

/** Of `employeeIds`, the ones HR has flagged as field staff (hex ids). */
export async function fieldStaffAmong(employeeIds: readonly unknown[]): Promise<Set<string>> {
  const ids = employeeIds.map((id) => idOf(id)).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Set();
  const employees = await Employee.find({ _id: { $in: ids }, isFieldStaff: true })
    .select('_id')
    .lean()
    .exec();
  return new Set(employees.map((emp) => String(emp._id)));
}

/**
 * Whether the employee is clocked in at `now`: today's attendance row has a
 * check-in and no check-out, or — after midnight on a night shift — the
 * latest open check-in of the last 36 h is still in progress.
 */
export async function isClockedIn(employee: TrackedEmployee, now: Date): Promise<boolean> {
  const today = startOfBusinessDay(now);
  const row = await Attendance.findOne({ employeeId: employee._id, date: today })
    .select('date checkIn checkOut')
    .lean()
    .exec();
  if (row?.checkIn?.time) return !row.checkOut?.time;

  const since = new Date(now.getTime() - OPEN_PUNCH_LOOKBACK_MS);
  const open = await Attendance.findOne({
    employeeId: employee._id,
    date: { $gte: new Date(startOfBusinessDay(since).getTime() - DAY_MS), $lt: today },
    'checkIn.time': { $gte: since },
    'checkOut.time': null,
  })
    .sort({ 'checkIn.time': -1 })
    .select('date checkIn checkOut')
    .lean()
    .exec();
  return !!open && isRowInProgress(open, await resolveShift(employee), now);
}

/**
 * 403 `NOT_FIELD_STAFF` / `TRACKING_DISABLED` / `NOT_CLOCKED_IN` unless the
 * employee may be tracked now. `user` is the employee's login (populated role).
 */
export async function assertMayTrack(
  employee: TrackedEmployee,
  _user: { role?: unknown; customPermissions?: string[] } | null | undefined,
  now: Date,
): Promise<void> {
  if (!employee.isFieldStaff) {
    throw new AppError('Location is only recorded for field staff', 403, 'NOT_FIELD_STAFF');
  }
  const cfg = await AttendanceConfig.findOne({}).select('liveTracking').lean().exec();
  if (!cfg?.liveTracking?.enabled) {
    throw new AppError('Live location tracking is turned off', 403, 'TRACKING_DISABLED');
  }
  if (!(await isClockedIn(employee, now))) {
    throw new AppError(
      'Your location is only recorded while you are clocked in',
      403,
      'NOT_CLOCKED_IN',
    );
  }
}

// ─── Ingest ───────────────────────────────────────────────────────────────

export function employeeName(e: { firstName?: string; lastName?: string } | null | undefined): string {
  return `${e?.firstName ?? ''} ${e?.lastName ?? ''}`.trim();
}

/**
 * Store a batch of the caller's fixes and broadcast the newest one. Each fix
 * keeps the device's `recordedAt` (as `timestamp`, clamped to now if the
 * phone's clock runs ahead) and gets the server's `receivedAt`, which
 * retention keys on. Fixes recorded more than 24 h ago are dropped. Returns
 * how many were stored and how many dropped.
 */
export async function recordLocationBatch(
  req: Request,
  points: TrackingPoint[],
): Promise<{ ingested: number; dropped: number }> {
  if (!req.user?._id) throw new UnauthorizedError();
  const employee = await Employee.findOne({ userId: req.user._id })
    .select('firstName lastName profileImage reportingManager shift isFieldStaff')
    .lean<TrackedEmployee>()
    .exec();
  if (!employee) {
    throw new AppError('No employee profile is linked to this account', 404, 'NO_EMPLOYEE_PROFILE');
  }

  const now = new Date();
  await assertMayTrack(employee, req.user, now);

  const oldest = now.getTime() - MAX_POINT_AGE_MS;
  const fresh = points.filter((p) => p.recordedAt.getTime() >= oldest);
  const dropped = points.length - fresh.length;
  if (fresh.length === 0) return { ingested: 0, dropped };

  const docs = fresh.map((p) => ({
    employeeId: employee._id,
    timestamp: p.recordedAt.getTime() > now.getTime() ? now : p.recordedAt,
    receivedAt: now,
    location: { type: 'Point' as const, coordinates: [p.lng, p.lat] as [number, number] },
    accuracy: p.accuracy,
    speed: p.speed,
    altitude: p.altitude,
    heading: p.heading,
    activity: p.activity,
    battery: p.battery,
    isCharging: p.isCharging,
    networkType: p.networkType,
    isOffline: p.isOffline,
    syncedAt: now,
  }));
  await LocationTrack.insertMany(docs);

  const latest = docs.reduce((a, b) => (b.timestamp.getTime() > a.timestamp.getTime() ? b : a));
  broadcastLocation(employee, {
    lat: latest.location.coordinates[1],
    lng: latest.location.coordinates[0],
    accuracy: latest.accuracy,
    recordedAt: latest.timestamp,
  });
  return { ingested: docs.length, dropped };
}

/**
 * `location:update` on `/field-tracking` to `managers:all` and to the rep's
 * manager's `reports:<managerEmployeeId>` room. A no-op without a socket
 * server (tests, CLI); a failed emit never fails the upload.
 */
function broadcastLocation(
  employee: TrackedEmployee,
  fix: { lat: number; lng: number; accuracy: number; recordedAt: Date },
): void {
  const io = getIO();
  if (!io) return;
  const rooms = [MANAGERS_ROOM];
  const manager = idOf(employee.reportingManager);
  if (manager) rooms.push(reportsRoom(manager));
  try {
    io.of(FIELD_TRACKING_NAMESPACE)
      .to(rooms)
      .emit(LOCATION_UPDATE_EVENT, {
        employeeId: String(employee._id),
        name: employeeName(employee),
        avatar: employee.profileImage ?? null,
        lat: fix.lat,
        lng: fix.lng,
        accuracy: fix.accuracy,
        recordedAt: fix.recordedAt.toISOString(),
      });
  } catch (err) {
    logger.warn({ err, employeeId: String(employee._id) }, 'location:update broadcast failed');
  }
}

// ─── Visibility ───────────────────────────────────────────────────────────

/**
 * Employee ids whose locations and visits the caller may see: `null` for a
 * `field-sales.manage` holder (everyone), else their own plus their direct
 * reports' (empty without an employee record).
 */
export async function visibleRepIds(req: Request): Promise<Types.ObjectId[] | null> {
  if (hasPermission(req.user, MANAGE)) return null;
  const [self, reports] = await Promise.all([currentEmployeeId(req), directReportIds(req)]);
  return self ? [self, ...reports] : reports;
}

/** 403 `NOT_YOUR_REPORT` unless the caller may see `employeeId`'s locations. */
export async function assertCanSeeRep(req: Request, employeeId: string): Promise<void> {
  const ids = await visibleRepIds(req);
  if (ids === null || ids.some((id) => id.toHexString() === employeeId)) return;
  throw new AppError(
    "You can only see your own and your direct reports' locations",
    403,
    'NOT_YOUR_REPORT',
  );
}

// ─── Days ─────────────────────────────────────────────────────────────────

/** A `YYYY-MM-DD` calendar date that exists. */
export const dateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Not a calendar date');

/**
 * The instants of a business-timezone (IST) calendar day: `[from, to)`.
 * Defaults to today's business day.
 */
export function businessDayRange(dateKey?: string): { date: string; from: Date; to: Date } {
  // A day label is UTC midnight of the business calendar date, so its UTC
  // date string *is* that calendar date.
  const label = dateKey ? new Date(`${dateKey}T00:00:00Z`) : startOfBusinessDay(new Date());
  const from = atBusinessTime(label, '00:00');
  return { date: label.toISOString().slice(0, 10), from, to: new Date(from.getTime() + DAY_MS) };
}

/** Lower bound on check-in for a visit to count as the rep's current visit. */
export function openVisitSince(now = new Date()): Date {
  return new Date(now.getTime() - OPEN_VISIT_MAX_MS);
}

// ─── Visit pins ───────────────────────────────────────────────────────────

/** A lean visit with `clientId` populated (`name location`), or null when the client is gone. */
export interface VisitLike {
  _id: Types.ObjectId;
  employeeId: unknown;
  clientId: unknown;
  checkIn?: { time?: Date; location?: { lat?: number; lng?: number } } | null;
  checkOut?: { time?: Date } | null;
  status?: string;
  purpose?: string;
}

interface PopulatedClient {
  _id: Types.ObjectId;
  name?: string;
  location?: { coordinates?: number[] } | null;
}

/**
 * A visit as a map pin: where the rep checked in, else the client's own
 * location (`lat`/`lng` null when neither is known).
 */
export function visitPin(v: VisitLike) {
  const client =
    v.clientId && typeof v.clientId === 'object' && !(v.clientId instanceof Types.ObjectId)
      ? (v.clientId as PopulatedClient)
      : null;
  const fix = v.checkIn?.location;
  const hasFix = typeof fix?.lat === 'number' && typeof fix?.lng === 'number';
  const coords = client?.location?.coordinates;
  return {
    visitId: String(v._id),
    employeeId: idOf(v.employeeId),
    clientId: idOf(v.clientId),
    clientName: client?.name ?? null,
    lat: hasFix ? (fix!.lat as number) : (coords?.[1] ?? null),
    lng: hasFix ? (fix!.lng as number) : (coords?.[0] ?? null),
    checkInAt: v.checkIn?.time ?? null,
    checkOutAt: v.checkOut?.time ?? null,
    status: v.status ?? null,
    purpose: v.purpose ?? null,
  };
}
