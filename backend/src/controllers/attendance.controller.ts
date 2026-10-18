import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AttendanceConfig, type IAttendanceConfig } from '../models/attendance-config.model.js';
import { Attendance, type IAttendance, type ICheckinRecord } from '../models/attendance.model.js';
import { QRCode } from '../models/qr-code.model.js';
import { GeofenceZone } from '../models/geofence-zone.model.js';
import { AttendanceSite } from '../models/attendance-site.model.js';
import { AllowedIP } from '../models/allowed-ip.model.js';
import { Employee } from '../models/employee.model.js';
import { Shift, type IShift } from '../models/shift.model.js';
import { Holiday } from '../models/holiday.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { isWeekOff, toKey } from '../lib/week-off.js';
import { DAY_MS, startOfBusinessDay } from '../lib/business-day.js';
import {
  applyShiftRules,
  attendanceDayFor,
  computeHours,
  isRowInProgress,
  resolveShift,
  type WorkedHoursSource,
} from '../lib/attendance-hours.js';
import { getWeekOffRule, invalidateWeekOffRule } from '../services/week-off.service.js';
import { closeBusinessDay, DayCloseError, type DayCloseCounts } from '../services/day-close.service.js';
import { AppError, NotFoundError, ValidationAppError, ForbiddenError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { assertNotSelfApproval, currentEmployeeId, hasPermission } from '../lib/access.js';
import { assertCanDecide, canSeeAll, directReportIds } from '../lib/approvals.js';
import { isDuplicateKey } from '../lib/leave-allocation.js';
import { logger } from '../config/logger.js';
import {
  formatBusinessDate,
  notifyRegularization,
  notifyRegularizationDecision,
  reportingManagerUserId,
} from '../services/notification.service.js';
import { LocationTrack } from '../models/location-track.model.js';
import { getFieldTrackingNamespace } from '../sockets/field-tracking.socket.js';

// ============================================================================
// CONFIG
// ============================================================================

export const updateConfigSchema = z.object({
  enabledMethods: z
    .array(z.enum(['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual']))
    .min(1),
  settings: z
    .object({
      autoCheckoutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      overtimeThresholdMinutes: z.number().int().min(0).default(540),
      lateMarkAfterMinutes: z.number().int().min(0).default(15),
      halfDayThresholdHours: z.number().min(0).default(4),
      requirePhotoOnCheckIn: z.boolean().default(false),
      requireLocation: z.boolean().default(false),
      requireNoteOnLateCheckIn: z.boolean().default(false),
      freeLateDaysPerMonth: z.number().int().min(0).default(3),
      expenseBeforeCheckout: z.enum(['all', 'field', 'none']).default('all'),
    })
    .partial()
    .optional(),
  liveTracking: z
    .object({
      enabled: z.boolean().default(false),
      intervalSeconds: z.number().int().min(30).max(3600).default(120),
    })
    .partial()
    .optional(),
  // Which days the company doesn't work. `fullDaysOff` is every week;
  // `partialDaysOff` picks occurrences, e.g. { day: 6, weeks: [2, 4] } for the
  // 2nd and 4th Saturday.
  weekOff: z
    .object({
      fullDaysOff: z.array(z.number().int().min(0).max(6)).default([]),
      partialDaysOff: z
        .array(
          z.object({
            day: z.number().int().min(0).max(6),
            weeks: z.array(z.number().int().min(1).max(5)).default([]),
          }),
        )
        .default([]),
    })
    .partial()
    .optional(),
});

export async function getConfig(_req: Request, res: Response): Promise<void> {
  let cfg = await AttendanceConfig.findOne({}).exec();
  if (!cfg) {
    cfg = await AttendanceConfig.create({ enabledMethods: ['manual'], settings: {} });
  }
  res.json({ success: true, data: cfg });
}

export async function updateConfig(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateConfigSchema>;
  const cfg = await AttendanceConfig.findOneAndUpdate({}, body, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true,
  }).exec();
  // The rule is cached per-process — drop it so the save takes effect now.
  invalidateWeekOffRule();
  void audit({ action: 'update', entity: 'AttendanceConfig', entityId: String(cfg._id), after: body });
  res.json({ success: true, data: cfg });
}

// ============================================================================
// CHECK-IN / CHECK-OUT
// ============================================================================

const locationPointSchema = z.object({
  lat: z.number().optional(),
  lng: z.number().optional(),
  accuracy: z.number().optional(),
  address: z.string().optional(),
});

const deviceInfoSchema = z.object({
  model: z.string().optional(),
  os: z.string().optional(),
  appVersion: z.string().optional(),
});

export const checkInSchema = z.object({
  method: z.enum(['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual']),
  location: locationPointSchema.optional(),
  photo: z.string().optional(),
  deviceInfo: deviceInfoSchema.optional(),
  qrCode: z.string().optional(),
  siteId: z.string().optional(),
  geofenceId: z.string().optional(),
  deviceId: z.string().optional(),
  faceConfidence: z.number().optional(),
  liveness: z.boolean().optional(),
  note: z.string().optional(),
});

export const checkOutSchema = checkInSchema.extend({
  method: z.enum(['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual']).default('manual'),
});

export const breakStartSchema = z.object({
  type: z.enum(['tea', 'lunch', 'personal', 'other']).default('other'),
});

export const breakEndSchema = z.object({});

/**
 * Which attendance day an instant belongs to, resolved in the business
 * timezone. See `lib/business-day.ts` — this used to be server-local
 * (UTC), which filed pre-05:30 IST punches against the previous day.
 */
function startOfDay(d: Date): Date {
  return startOfBusinessDay(d);
}

/** A punch time in the business timezone, for messages employees read. */
function formatPunchTime(t: Date): string {
  return t.toLocaleTimeString('en-IN', {
    timeZone: process.env.TIMEZONE || 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function pointInPolygon(point: { lat: number; lng: number }, polygon: { lat: number; lng: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;
    const intersect = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct, 10), 0);
}

async function getCurrentEmployee(): Promise<{ id: Types.ObjectId; doc: any } | null> {
  const userId = getUserId();
  if (!userId) return null;
  const emp = await Employee.findOne({ userId }).exec();
  return emp ? { id: emp._id as Types.ObjectId, doc: emp } : null;
}

/**
 * Enforce the per-employee "location is compulsory" flag.
 *
 * Set by an admin on the employee record. When on, a punch without usable
 * coordinates is rejected outright rather than stored without a location —
 * an attendance row you cannot place is worth very little after the fact.
 * Employees without the flag are unaffected.
 */
function assertLocationIfRequired(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any,
  location: { lat?: number; lng?: number } | undefined,
  action: 'check in' | 'check out',
  globalRequireLocation?: boolean,
): void {
  if (!employee?.requireLocation && !globalRequireLocation) return;
  const hasFix = typeof location?.lat === 'number' && typeof location?.lng === 'number';
  if (!hasFix) {
    throw new AppError(
      `Location sharing is required for you to ${action}. Enable location access and try again.`,
      400,
      'LOCATION_REQUIRED',
    );
  }
}

/**
 * Face matching is not built: the client used to send its own confidence
 * score and the server believed it. Refused outright until there is a real
 * server-side check.
 */
function faceUnavailable(): AppError {
  return new AppError('Face verification is not available yet', 400, 'METHOD_UNAVAILABLE');
}

/**
 * Prove a check-in came through `method`: it must be enabled for the tenant
 * and its evidence (QR code, office IP, site/geofence position, device) must
 * check out. Check-in only — check-out is not re-validated (see `checkOut`).
 * `face` never gets here: `checkIn` refuses it first.
 */
async function validateMethod(
  method: string,
  body: z.infer<typeof checkInSchema>,
  req: Request,
  cfg: IAttendanceConfig | null,
): Promise<{ metadata: Record<string, unknown> }> {
  if (cfg && !cfg.enabledMethods.includes(method as any)) {
    throw new ValidationAppError(`Check-in method '${method}' is not enabled for this tenant`);
  }
  const metadata: Record<string, unknown> = {};

  switch (method) {
    case 'qr': {
      if (!body.qrCode) throw new ValidationAppError('qrCode is required');
      const qr = await QRCode.findOne({ code: body.qrCode, type: 'static', isActive: true }).exec();
      if (!qr) throw new ValidationAppError('Invalid or inactive QR code');
      if (qr.expiresAt && qr.expiresAt < new Date()) throw new ValidationAppError('QR code expired');
      metadata.qrCodeId = String(qr._id);
      if (qr.locationId) metadata.siteId = String(qr.locationId);
      break;
    }
    case 'dynamic_qr': {
      if (!body.qrCode) throw new ValidationAppError('qrCode is required');
      const qr = await QRCode.findOne({ code: body.qrCode, type: 'dynamic', isActive: true }).exec();
      if (!qr) throw new ValidationAppError('Invalid dynamic QR code');
      if (!qr.expiresAt || qr.expiresAt < new Date()) {
        throw new ValidationAppError('Dynamic QR code expired — please scan the latest code');
      }
      metadata.qrCodeId = String(qr._id);
      break;
    }
    case 'ip': {
      // `req.ip` honours `trust proxy` (one hop): the address our proxy saw,
      // not the first X-Forwarded-For entry, which the client can write.
      const cleanIp = (req.ip ?? '').replace(/^::ffff:/, '');
      const allowed = await AllowedIP.find({ isActive: true }).exec();
      const matched = allowed.find((entry) => {
        if (entry.ipAddress && entry.ipAddress === cleanIp) return true;
        if (entry.ipRangeStart && entry.ipRangeEnd) {
          try {
            const ip = ipToLong(cleanIp);
            return ip >= ipToLong(entry.ipRangeStart) && ip <= ipToLong(entry.ipRangeEnd);
          } catch {
            return false;
          }
        }
        return false;
      });
      if (!matched) throw new ValidationAppError(`IP ${cleanIp} not in allowed list`);
      metadata.ipAddress = cleanIp;
      break;
    }
    case 'site': {
      if (!body.siteId) throw new ValidationAppError('siteId is required');
      if (!body.location?.lat || !body.location?.lng) {
        throw new ValidationAppError('Location is required for site check-in');
      }
      const site = await AttendanceSite.findById(body.siteId).exec();
      if (!site || !site.isActive) throw new ValidationAppError('Site not found or inactive');
      const dist = haversineMeters(
        { lat: body.location.lat, lng: body.location.lng },
        { lat: site.location.lat, lng: site.location.lng },
      );
      if (dist > site.radius) {
        throw new ValidationAppError(
          `You are ${Math.round(dist)}m from site '${site.name}' (allowed: ${site.radius}m)`,
        );
      }
      metadata.siteId = String(site._id);
      break;
    }
    case 'geofence': {
      if (!body.geofenceId) throw new ValidationAppError('geofenceId is required');
      if (!body.location?.lat || !body.location?.lng) {
        throw new ValidationAppError('Location is required for geofence check-in');
      }
      const zone = await GeofenceZone.findById(body.geofenceId).exec();
      if (!zone || !zone.isActive) throw new ValidationAppError('Geofence zone not found or inactive');
      const point = { lat: body.location.lat, lng: body.location.lng };
      let inside = false;
      if (zone.type === 'circle' && zone.center && zone.radius) {
        inside = haversineMeters(point, zone.center) <= zone.radius;
      } else if (zone.type === 'polygon' && zone.coordinates.length >= 3) {
        inside = pointInPolygon(point, zone.coordinates);
      }
      if (!inside) throw new ValidationAppError(`You are outside geofence '${zone.name}'`);
      metadata.geofenceId = String(zone._id);
      break;
    }
    case 'device': {
      if (!body.deviceId) throw new ValidationAppError('deviceId is required');
      metadata.deviceId = body.deviceId;
      break;
    }
    case 'manual': {
      // Nothing to prove beyond who is asking. Where location is compulsory
      // (`settings.requireLocation` or the employee's own flag), `checkIn`
      // has already enforced it via `assertLocationIfRequired`.
      break;
    }
  }
  return { metadata };
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkInSchema>;
  if (body.method === 'face') throw faceUnavailable();
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const cfg = await AttendanceConfig.findOne({}).exec();
  if (cfg?.settings.requirePhotoOnCheckIn && !body.photo) {
    throw new ValidationAppError('Photo is required for check-in');
  }
  // Compulsory location (company-wide or per employee) applies to every
  // method, manual included.
  assertLocationIfRequired(emp.doc, body.location, 'check in', cfg?.settings.requireLocation);

  const { metadata } = await validateMethod(body.method, body, req, cfg);

  const now = new Date();
  const shift = await resolveShift(emp.doc);
  // Today — or, inside the tail of an overnight shift, the evening it began.
  const day = attendanceDayFor(now, shift);
  let att = await Attendance.findOne({ employeeId: emp.id, date: day }).exec();
  if (att?.checkIn?.time) {
    throw new ValidationAppError(
      `Already checked in today at ${formatPunchTime(att.checkIn.time)}.`,
    );
  }

  // A row may already hold the day: day-close's `auto_absent`, or a leave
  // stamped ahead of time. The punch takes it over; a leave stamp
  // (`leaveRequestId` / `isPaidLeave`) and its status stay.
  att ??= new Attendance({ employeeId: emp.id, date: day });
  att.checkIn = {
    time: now,
    method: body.method,
    location: body.location,
    photo: body.photo,
    deviceInfo: body.deviceInfo,
    metadata,
  } as ICheckinRecord;
  att.source = 'punch';
  // Late against the shift start + grace; status present/late.
  applyShiftRules(att, shift, cfg);
  await att.save();

  void audit({ action: 'create', entity: 'Attendance', entityId: String(att._id), after: { method: body.method } });
  res.status(201).json({ success: true, data: att });
}

/* ── Worked-hours maths ─────────────────────────────────────────────
 * `totalWorkingHours` is only persisted at check-out, so an in-progress day
 * reads back as 0 and every "hours today" tile showed 0h 0m until the employee
 * checked out. `computeHours` (lib/attendance-hours.ts) computes the figure
 * from the timestamps instead, so a day in progress reports the hours worked
 * so far.
 * ─────────────────────────────────────────────────────────────────── */

/**
 * Fill in `totalWorkingHours` for a day that is still running — by the same
 * rule `currentRow` uses (`isRowInProgress`: today's open row, or a night
 * shift's open row until 6 h after its end). Finished days and forgotten
 * check-outs keep their stored value, so a forgotten one stays visible as the
 * anomaly it is instead of growing without bound. Nothing is written back.
 */
function withLiveHours<T extends WorkedHoursSource>(att: T, shift: IShift | null, now: Date): T {
  if (!isRowInProgress(att, shift, now)) return att;
  // Callers hand us either lean objects or hydrated documents (paginate()
  // does not lean). Spreading a document would serialise its internals, so
  // convert first.
  const asDoc = att as unknown as { toObject?: () => T };
  const plain = typeof asDoc.toObject === 'function' ? asDoc.toObject() : att;
  return { ...plain, totalWorkingHours: computeHours(att, now) };
}

type LiveRow = WorkedHoursSource & { employeeId?: unknown };

/** An `employeeId` that may be populated, as a string. */
const ownerKey = (employeeId: unknown): string =>
  String((employeeId as { _id?: unknown } | null)?._id ?? employeeId);

/**
 * `withLiveHours` for a list of rows (any mix of employees). Only an open row
 * from an earlier day needs its owner's shift; those owners' shifts are loaded
 * in one query, and only when there is such a row.
 */
async function withLiveHoursAll<T extends LiveRow>(rows: T[], now: Date = new Date()): Promise<T[]> {
  const today = startOfDay(now).getTime();
  const owners = new Set(
    rows
      .filter((r) => r.checkIn?.time && !r.checkOut?.time && r.date && startOfDay(new Date(r.date)).getTime() < today)
      .map((r) => ownerKey(r.employeeId)),
  );
  const shifts = new Map<string, IShift | null>();
  if (owners.size > 0) {
    const [docs, defaultShift] = await Promise.all([
      Employee.find({ _id: { $in: [...owners] } })
        .setOptions({ withDeleted: true })
        .select('_id shift')
        .populate('shift')
        .exec(),
      Shift.findOne({ isDefault: true }).exec(),
    ]);
    for (const d of docs) shifts.set(String(d._id), await resolveShift(d, { defaultShift }));
  }
  return rows.map((r) => withLiveHours(r, shifts.get(ownerKey(r.employeeId)) ?? null, now));
}

/* ── Which row does a punch-out act on? ─────────────────────────────
 * Check-out used to look at today's row only, so a night shift (in 22:00,
 * out 06:00) could never check out: by morning "today" had moved on.
 * ─────────────────────────────────────────────────────────────────── */

type CurrentEmployee = NonNullable<Awaited<ReturnType<typeof getCurrentEmployee>>>;

/** How far back a check-out looks for its check-in: a night shift plus slack. */
const OPEN_PUNCH_LOOKBACK_MS = 36 * 60 * 60 * 1000;

/**
 * The employee's latest check-in of the last 36 h with no check-out yet —
 * after midnight on a night shift, yesterday's row.
 */
async function findOpenPunch(employeeId: Types.ObjectId, now: Date): Promise<IAttendance | null> {
  const since = new Date(now.getTime() - OPEN_PUNCH_LOOKBACK_MS);
  return Attendance.findOne({
    employeeId,
    // Loose day bound so the (employeeId, date) index narrows the scan; the
    // exact 36 h bound is on the check-in itself.
    date: { $gte: new Date(startOfDay(since).getTime() - DAY_MS) },
    'checkIn.time': { $gte: since },
    'checkOut.time': null,
  })
    .sort({ 'checkIn.time': -1 })
    .exec();
}

/**
 * The row check-out, breaks and the "today" card act on: today's row once it
 * has a check-in; otherwise the latest open check-in of the last 36 h if it
 * is still in progress (`isRowInProgress`) — a night shift after midnight,
 * up to 6 h past its end (`OVERNIGHT_CHECKOUT_ALLOWANCE_HOURS`); otherwise
 * today's row, if any.
 *
 * Past that an open row is a forgotten check-out (day-close closes it at
 * shift end + grace): it must not stand in for today — a punch the next
 * evening would otherwise close a 24-hour "day" — nor hide the check-in
 * button. A day-shift row from an earlier day never qualifies.
 */
async function currentRow(emp: CurrentEmployee, now: Date): Promise<IAttendance | null> {
  const today = await Attendance.findOne({ employeeId: emp.id, date: startOfDay(now) }).exec();
  if (today?.checkIn?.time) return today;
  const open = await findOpenPunch(emp.id, now);
  if (open && isRowInProgress(open, await resolveShift(emp.doc), now)) return open;
  return today;
}

/**
 * Company policy may require the day's expense entry before check-out —
 * `settings.expenseBeforeCheckout`: `all` (default) | `field` (field staff
 * only) | `none`. The error code `EXPENSE_REQUIRED_FOR_CHECKOUT` is the
 * contract: web and mobile open their expense form when it fires.
 */
async function assertExpenseFiled(
  emp: CurrentEmployee,
  att: IAttendance,
  cfg: IAttendanceConfig | null,
  now: Date,
): Promise<void> {
  const gate = cfg?.settings.expenseBeforeCheckout ?? 'all';
  if (gate === 'none' || (gate === 'field' && emp.doc.isFieldStaff !== true)) return;
  // An entry dated on the row's day or today counts: a night shift checks
  // out the morning after the day its row is filed under.
  const expense = await ExpenseClaim.findOne({
    employeeId: emp.id,
    date: { $gte: att.date, $lt: new Date(startOfDay(now).getTime() + DAY_MS) },
    isDeleted: { $ne: true },
  })
    .select('_id')
    .lean()
    .exec();
  if (!expense) {
    throw new AppError(
      "Submit today's expense entry before checking out.",
      400,
      'EXPENSE_REQUIRED_FOR_CHECKOUT',
    );
  }
}

/**
 * Settle a day's figures after its punches changed: end any break still open
 * at the check-out (so it is deducted rather than counted as work), store the
 * worked hours — they are only persisted once the day is closed, so a
 * check-in on its own keeps them derived — and re-judge the day from scratch
 * with the employee's shift (late, early leave, overtime, status). Shared by
 * check-out, HR corrections and approved regularizations so all three agree.
 * Mutates `att`; the caller saves it.
 */
function settleDay(
  att: IAttendance,
  closedAt: Date | undefined,
  shift: IShift | null,
  cfg: IAttendanceConfig | null,
): void {
  if (closedAt) {
    for (const b of att.breaks) {
      if (b.startTime && !b.endTime) {
        b.endTime = closedAt < b.startTime ? b.startTime : closedAt;
        b.duration = Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60_000);
      }
    }
    att.totalWorkingHours = computeHours(att, closedAt);
  }
  applyShiftRules(att, shift, cfg);
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkOutSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const now = new Date();
  // Today's row once it has a check-in (already closed → say so); otherwise a
  // night shift's row still in progress after midnight.
  const att = await currentRow(emp, now);
  if (!att?.checkIn?.time) throw new ValidationAppError('You must check in first');
  if (att.checkOut?.time) {
    // Name the recorded time. Employees hit this without knowingly checking
    // out — most often because submitting the expense from the check-out flow
    // completes the check-out for them — and a bare "Already checked out"
    // gives them nothing to reconcile against.
    throw new ValidationAppError(
      `Already checked out today at ${formatPunchTime(att.checkOut.time)}.`,
    );
  }

  const cfg = await AttendanceConfig.findOne({}).exec();
  // The method is not re-validated: mobile always sends `manual`, and the
  // check-in already proved presence. Compulsory location still applies.
  assertLocationIfRequired(emp.doc, body.location, 'check out', cfg?.settings.requireLocation);
  await assertExpenseFiled(emp, att, cfg, now);

  att.checkOut = {
    time: now,
    // Not validated, so never recorded as face: there is no face check. (The
    // web widget sends its selected method, `enabledMethods[0]` by default.)
    method: body.method === 'face' ? 'manual' : body.method,
    location: body.location,
    photo: body.photo,
    deviceInfo: body.deviceInfo,
    metadata: {},
  } as ICheckinRecord;

  // Hours = (out - in) - break time, an open break included; then late /
  // early leave / half day / overtime against the employee's shift.
  settleDay(att, now, await resolveShift(emp.doc), cfg);

  await att.save();
  void audit({ action: 'update', entity: 'Attendance', entityId: String(att._id), after: { checkOut: now } });
  res.json({ success: true, data: att });
}

export async function startBreak(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof breakStartSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const att = await currentRow(emp, new Date());
  if (!att?.checkIn?.time) throw new ValidationAppError('Check in first');
  if (att.checkOut?.time) throw new ValidationAppError('Already checked out');

  const open = att.breaks.find((b) => !b.endTime);
  if (open) throw new ValidationAppError('A break is already in progress');

  att.breaks.push({ startTime: new Date(), type: body.type } as any);
  await att.save();
  res.status(201).json({ success: true, data: att });
}

export async function endBreak(_req: Request, res: Response): Promise<void> {
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const att = await currentRow(emp, new Date());
  if (!att) throw new ValidationAppError('No attendance record');

  const open = att.breaks.find((b) => !b.endTime);
  if (!open) throw new ValidationAppError('No active break');
  open.endTime = new Date();
  open.duration = Math.round((open.endTime.getTime() - open.startTime.getTime()) / 60_000);
  await att.save();
  res.json({ success: true, data: att });
}

// ============================================================================
// RECORDS / REPORTS
// ============================================================================

export const listRecordsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
  employeeId: z.string().optional(),
  departmentId: z.string().optional(),
  search: z.string().optional(),
  status: z
    .enum(['present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'weekend'])
    .optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  // `YYYY-MM` shorthand for from/to spanning one calendar month. Clients were
  // already sending this; it used to be dropped silently, which made
  // month-scoped screens count every record ever recorded.
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM')
    .optional(),
});

/**
 * Build the `date` filter from either `month=YYYY-MM` or an explicit
 * `from`/`to` pair. `month` wins when both are supplied — it's the more
 * specific intent. Returns undefined when the query isn't date-scoped.
 */
function dateRangeFilter(q: {
  month?: string;
  from?: Date;
  to?: Date;
}): Record<string, Date> | undefined {
  if (q.month) {
    const [year, month] = q.month.split('-').map(Number);
    return {
      $gte: new Date(year, month - 1, 1),
      // Day 0 of the next month is the last day of this one.
      $lte: new Date(year, month, 0, 23, 59, 59, 999),
    };
  }
  if (q.from || q.to) {
    const range: Record<string, Date> = {};
    if (q.from) range.$gte = q.from;
    if (q.to) range.$lte = q.to;
    return range;
  }
  return undefined;
}

/* ── Where did this punch happen? ────────────────────────────────────
 * Raw coordinates tell an admin very little. These resolve a point against
 * the sites and geofences already configured under Attendance → Settings, so
 * the records table can say "Head Office · 40 m" instead of two decimals.
 * No external geocoding service is involved — it is all local data.
 * ─────────────────────────────────────────────────────────────────── */

interface NamedArea {
  name: string;
  lat: number;
  lng: number;
  radius: number;
}

async function loadKnownAreas(): Promise<NamedArea[]> {
  const [sites, zones] = await Promise.all([
    AttendanceSite.find({ isActive: true }).select('name location radius').lean().exec(),
    GeofenceZone.find({}).select('name center radius').lean().exec(),
  ]);

  const areas: NamedArea[] = [];
  for (const s of sites) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loc = (s as any).location;
    if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areas.push({ name: (s as any).name, lat: loc.lat, lng: loc.lng, radius: (s as any).radius ?? 100 });
    }
  }
  for (const z of zones) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = (z as any).center;
    if (typeof c?.lat === 'number' && typeof c?.lng === 'number') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      areas.push({ name: (z as any).name, lat: c.lat, lng: c.lng, radius: (z as any).radius ?? 200 });
    }
  }
  return areas;
}

/**
 * Nearest configured area to a point: its name, the distance in metres, and
 * whether the point is inside the area's radius. Null when there are no
 * coordinates or no areas configured — the UI then falls back to lat/lng.
 */
function describeArea(
  loc: { lat?: number; lng?: number } | undefined,
  areas: NamedArea[],
): { name: string; distance: number; inside: boolean } | null {
  if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number' || areas.length === 0) {
    return null;
  }
  let best: { name: string; distance: number; inside: boolean } | null = null;
  for (const a of areas) {
    const distance = Math.round(haversineMeters({ lat: loc.lat, lng: loc.lng }, a));
    if (!best || distance < best.distance) {
      best = { name: a.name, distance, inside: distance <= a.radius };
    }
  }
  return best;
}

export async function listRecords(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listRecordsSchema>;
  const filter: Record<string, unknown> = {};
  if (q.employeeId) filter.employeeId = new Types.ObjectId(q.employeeId);
  if (q.status) filter.status = q.status;
  const dateFilter = dateRangeFilter(q);
  if (dateFilter) filter.date = dateFilter;

  let validEmpIds: string[] | null = null;
  
  if (q.departmentId) {
    const deptEmps = await Employee.find({ department: q.departmentId }).distinct('_id');
    validEmpIds = deptEmps.map(id => id.toString());
  }

  if (q.search) {
    const searchRegex = new RegExp(q.search, 'i');
    const matchedEmps = await Employee.find({
      $or: [
        { firstName: searchRegex },
        { lastName: searchRegex },
        { employeeId: searchRegex }
      ]
    }).distinct('_id');
    const matchedStrs = matchedEmps.map(id => id.toString());
    
    if (validEmpIds) {
      validEmpIds = validEmpIds.filter(id => matchedStrs.includes(id));
    } else {
      validEmpIds = matchedStrs;
    }
  }

  if (validEmpIds !== null) {
    if (filter.employeeId) {
      const targetStr = (filter.employeeId as Types.ObjectId).toString();
      if (!validEmpIds.includes(targetStr)) {
        filter.employeeId = new Types.ObjectId('000000000000000000000000');
      }
    } else {
      filter.employeeId = { $in: validEmpIds.map(id => new Types.ObjectId(id)) };
    }
  }

  const result = await Attendance.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-date',
    populate: { path: 'employeeId', select: 'firstName lastName employeeId department' },
  });
  // Same live-hours treatment as /my — without it the admin records and
  // timesheet pages report 0.00h for everyone still checked in.
  const areas = await loadKnownAreas();
  const live = await withLiveHoursAll(result.data as LiveRow[]);
  const data = live.map((r) => {
    const row = r as WorkedHoursSource & {
      toObject?: () => unknown;
      checkIn?: { location?: { lat?: number; lng?: number } } | null;
      checkOut?: { location?: { lat?: number; lng?: number } } | null;
    };
    // withLiveHours already converted in-progress rows; convert the rest.
    const plain =
      typeof row.toObject === 'function'
        ? (row.toObject() as Record<string, unknown>)
        : ({ ...row } as Record<string, unknown>);
    return {
      ...plain,
      checkInArea: describeArea(row.checkIn?.location, areas),
      checkOutArea: describeArea(row.checkOut?.location, areas),
    };
  });
  res.json({ success: true, data, pagination: result.pagination });
}

export async function myAttendance(req: Request, res: Response): Promise<void> {
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');
  const q = req.query as unknown as z.infer<typeof listRecordsSchema>;
  const filter: Record<string, unknown> = { employeeId: emp.id };
  const dateFilter = dateRangeFilter(q);
  if (dateFilter) filter.date = dateFilter;
  const result = await Attendance.paginate(filter, {
    page: q.page ?? 1,
    limit: q.limit ?? 50,
    sort: '-date',
  });
  // A day still running reports hours so far, so the month summary built
  // from this list isn't missing today's (or tonight's) work.
  const data = await withLiveHoursAll(result.data as LiveRow[]);
  res.json({ success: true, data, pagination: result.pagination });
}

export async function todayAttendance(_req: Request, res: Response): Promise<void> {
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');
  const now = new Date();
  // Today's row — or, after midnight on a night shift, the one still in
  // progress from the evening before, so the clients offer "Check out".
  const att = await currentRow(emp, now);
  // Hours-so-far for a day still in progress — this is the record every
  // "Hours today" tile on web and mobile reads.
  const [data] = att ? await withLiveHoursAll([att.toObject() as LiveRow], now) : [null];
  res.json({ success: true, data });
}

export async function myShift(_req: Request, res: Response): Promise<void> {
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');
  
  if (!emp.doc.shift) {
    res.json({ success: true, data: null });
    return;
  }
  const shift = await Shift.findById(emp.doc.shift).lean().exec();
  res.json({ success: true, data: shift });
}

export const monthlyQuerySchema = z.object({
  year: z.coerce.number().int(),
  month: z.coerce.number().int().min(1).max(12),
  employeeId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid employeeId').optional(),
});

export async function monthlyAttendance(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof monthlyQuerySchema>;
  // `?employeeId=` is for HR looking at someone's month; everyone else always
  // gets their own, whatever they pass.
  let employeeId: Types.ObjectId;
  if (q.employeeId && hasPermission(req.user, 'attendance.view')) {
    employeeId = new Types.ObjectId(q.employeeId);
  } else {
    const own = await currentEmployeeId(req);
    if (!own) throw new ForbiddenError('No employee profile found for current user');
    employeeId = own;
  }
  const from = new Date(q.year, q.month - 1, 1);
  const to = new Date(q.year, q.month, 0, 23, 59, 59);
  const records = await Attendance.find({ employeeId, date: { $gte: from, $lte: to } })
    .sort('date')
    .lean()
    .exec();

  // Nobody writes an attendance row for a Sunday or a public holiday, so the
  // calendars used to render those days as plain (i.e. working) days. Fill the
  // gaps here rather than in each client, so web and mobile agree.
  const holidays = await Holiday.find({ date: { $gte: from, $lte: to } })
    .select('date')
    .lean()
    .exec();
  const holidaySet = new Set(holidays.map((h) => toKey(new Date(h.date))));

  const rule = await getWeekOffRule();
  const stored = new Set(records.map((r) => toKey(new Date(r.date))));
  const filled: typeof records = [...records];
  const lastDay = new Date(q.year, q.month, 0).getDate();
  for (let d = 1; d <= lastDay; d++) {
    const day = new Date(q.year, q.month - 1, d);
    const key = toKey(day);
    if (stored.has(key)) continue;
    const isHoliday = holidaySet.has(key);
    if (!isHoliday && !isWeekOff(day, rule)) continue;
    filled.push({
      // Synthetic, never persisted — derived from the calendar, not the DB.
      _id: `virtual-${key}`,
      employeeId,
      date: day,
      status: isHoliday ? 'holiday' : 'weekend',
      isVirtual: true,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }
  filled.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Same as /my — a day still running reports hours so far. The mobile
  // month summary is built from this endpoint.
  const withHours = await withLiveHoursAll(filled as LiveRow[]);

  res.json({ success: true, data: withHours });
}

// ============================================================================
// REGULARIZATION — ask for a day's punches to be corrected; an approver decides
// ============================================================================

export const regularizeSchema = z.object({
  date: z.coerce.date(),
  reason: z.string().min(3),
  // The punches being asked for — either one, or both. Nothing is written to
  // the row until an approver agrees; a request with neither is reason-only.
  checkIn: z.coerce.date().optional(),
  checkOut: z.coerce.date().optional(),
});

/** A regularized check-out is at most this long after the check-in: one shift, not a day. */
const MAX_REQUESTED_SPAN_MS = 12 * 60 * 60 * 1000;

const SELF_APPROVAL_MESSAGE = 'You cannot approve or reject your own regularization request';
const LEAVE_DAY_MESSAGE = 'Cancel the leave before regularizing this day';
const DECIDED_MEANWHILE_MESSAGE = 'This request was decided meanwhile — reload and try again';

const leaveDayError = (): AppError => new AppError(LEAVE_DAY_MESSAGE, 400, 'LEAVE_DAY');
const pendingError = (): AppError =>
  new AppError('A regularization request is already pending for this day', 409, 'REGULARIZATION_PENDING');

/**
 * The punches a request asks for must be believable for `day` (a day label):
 * a check-in on that business day, a check-out strictly after the check-in
 * and within a shift of it (it may cross midnight), and neither in the
 * future. A request may carry one punch only: the other is then the one
 * already `recorded` on the row, and the pair that would result is what is
 * checked.
 */
function assertRequestedTimes(
  day: Date,
  requested: { checkIn?: Date; checkOut?: Date },
  recorded: { checkIn?: Date; checkOut?: Date },
  now: Date,
): void {
  const { checkIn, checkOut } = requested;
  if (!checkIn && !checkOut) return;
  if (checkIn && startOfBusinessDay(checkIn).getTime() !== day.getTime()) {
    throw new ValidationAppError('The check-in must fall on the day being regularized');
  }
  if ((checkIn && checkIn.getTime() > now.getTime()) || (checkOut && checkOut.getTime() > now.getTime())) {
    throw new ValidationAppError('A requested time cannot be in the future');
  }
  const inAt = checkIn ?? recorded.checkIn;
  const outAt = checkOut ?? recorded.checkOut;
  if (!inAt) throw new ValidationAppError('A check-out time needs a check-in time');
  if (!outAt) return;
  const span = outAt.getTime() - inAt.getTime();
  if (span <= 0) {
    throw new ValidationAppError(
      !checkOut
        ? 'The requested check-in must be before the check-out already recorded for this day'
        : !checkIn
          ? 'The requested check-out must be after the check-in already recorded for this day'
          : 'The check-out must be after the check-in',
    );
  }
  if (span > MAX_REQUESTED_SPAN_MS) {
    throw new ValidationAppError('The check-out must be within 12 hours of the check-in');
  }
}

/** Tell the employee's reporting manager about a new request. Never throws. */
async function notifyManagerOfRegularization(emp: CurrentEmployee, att: IAttendance): Promise<void> {
  try {
    const managerUserId = await reportingManagerUserId(emp.doc);
    if (!managerUserId) return;
    await notifyRegularization(
      managerUserId,
      `${emp.doc.firstName} ${emp.doc.lastName}`,
      formatBusinessDate(att.date),
      { attendanceId: String(att._id) },
    );
  } catch (err) {
    logger.warn({ err, attendanceId: String(att._id) }, 'attendance: regularization manager notification failed');
  }
}

/** Tell the employee their request was decided. Never throws. */
async function notifyEmployeeOfRegularizationDecision(
  ownerUserId: Types.ObjectId | undefined,
  att: IAttendance,
  status: 'approved' | 'rejected',
): Promise<void> {
  if (!ownerUserId) return;
  try {
    await notifyRegularizationDecision(String(ownerUserId), {
      date: att.date,
      status,
      attendanceId: String(att._id),
    });
  } catch (err) {
    logger.warn({ err, attendanceId: String(att._id) }, 'attendance: regularization decision notification failed');
  }
}

export async function requestRegularization(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof regularizeSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const now = new Date();
  const date = startOfBusinessDay(body.date);
  if (date.getTime() > startOfBusinessDay(now).getTime()) {
    throw new ValidationAppError('Cannot regularize a future date');
  }

  let att = await Attendance.findOne({ employeeId: emp.id, date }).exec();
  if (att?.leaveRequestId) throw leaveDayError();
  if (att?.regularization?.status === 'pending') throw pendingError();
  assertRequestedTimes(
    date,
    body,
    { checkIn: att?.checkIn?.time, checkOut: att?.checkOut?.time },
    now,
  );
  if (!att) {
    try {
      att = await Attendance.create({ employeeId: emp.id, date, status: 'absent' });
    } catch (err) {
      // Another submit for the same day created the row first. It will claim
      // it (or already has), so this one is told a request is pending.
      if (isDuplicateKey(err)) throw pendingError();
      throw err;
    }
  }

  // Claim the row only if no request is pending *now* and no leave covers the
  // day: two submits racing past the checks above (a double tap) must not both
  // land, nor both notify, and a leave approved meanwhile must not be hidden
  // under a new request.
  const claimed = await Attendance.findOneAndUpdate(
    { _id: att._id, 'regularization.status': { $ne: 'pending' }, leaveRequestId: null },
    {
      $set: {
        regularization: {
          requestedAt: now,
          reason: body.reason,
          status: 'pending',
          ...(body.checkIn ? { requestedCheckIn: body.checkIn } : {}),
          ...(body.checkOut ? { requestedCheckOut: body.checkOut } : {}),
        },
      },
    },
    { new: true },
  ).exec();
  if (!claimed) {
    const onLeave = await Attendance.exists({ _id: att._id, leaveRequestId: { $ne: null } });
    throw onLeave ? leaveDayError() : pendingError();
  }

  void audit({
    action: 'create',
    entity: 'Attendance',
    entityId: String(claimed._id),
    after: {
      regularization: 'pending',
      date,
      reason: body.reason,
      requestedCheckIn: body.checkIn,
      requestedCheckOut: body.checkOut,
    },
  });
  await notifyManagerOfRegularization(emp, claimed);
  res.status(201).json({ success: true, data: claimed });
}

export const listRegularizationsSchema = z.object({
  status: z.enum(['pending', 'approved', 'rejected']).default('pending'),
  // The global pagination guard already defaults `limit` to 20 and caps it at
  // 100 before this runs; these say the same thing.
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

/**
 * GET /api/v1/attendance/regularizations — the approval queue, newest request
 * first. HR (`attendance.manage`) sees everyone's; a manager (`attendance.approve`)
 * only their direct reports' — their own requests are not theirs to decide.
 */
export async function listRegularizations(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listRegularizationsSchema>;
  const scope = canSeeAll(req, 'attendance') ? {} : { employeeId: { $in: await directReportIds(req) } };
  const result = await Attendance.paginate(
    { 'regularization.status': q.status, ...scope },
    {
      page: q.page,
      limit: q.limit,
      sort: '-regularization.requestedAt -_id',
      populate: { path: 'employeeId', select: 'firstName lastName employeeId department' },
    },
  );
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export const approveRegularizationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export async function decideRegularization(req: Request, res: Response): Promise<void> {
  const { status } = req.body as z.infer<typeof approveRegularizationSchema>;
  const att = await Attendance.findById(String(req.params.id)).exec();
  if (!att) throw new NotFoundError('Attendance record not found');
  if (!att.regularization) throw new ValidationAppError('No regularization request on this record');
  await assertNotSelfApproval(req, att.employeeId, SELF_APPROVAL_MESSAGE);
  await assertCanDecide(req, att.employeeId, 'attendance');
  if (att.regularization.status !== 'pending') {
    throw new ValidationAppError(`This regularization request was already ${att.regularization.status}`);
  }
  if (status === 'approved' && att.leaveRequestId) throw leaveDayError();

  const before = {
    status: att.status,
    checkIn: att.checkIn?.time,
    checkOut: att.checkOut?.time,
    totalWorkingHours: att.totalWorkingHours,
  };
  const owner = await Employee.findById(att.employeeId).setOptions({ withDeleted: true }).select('userId shift').exec();

  // The write below only lands if this exact request is still pending, so two
  // deciders racing cannot both succeed (one would leave punches and a
  // `present` day under a rejection).
  att.$where = {
    'regularization.status': 'pending',
    'regularization.requestedAt': att.regularization.requestedAt,
  };

  const { requestedCheckIn, requestedCheckOut } = att.regularization;
  if (status === 'approved') {
    if (requestedCheckIn || requestedCheckOut) {
      // Only the punches the employee asked for are written; the other one,
      // when the row has it, stays exactly as recorded (method, location,
      // photo, device).
      const inAt = requestedCheckIn ?? att.checkIn?.time;
      const outAt = requestedCheckOut ?? att.checkOut?.time;
      if (!inAt) throw new ValidationAppError('The day has no check-in to pair the requested check-out with');
      if (outAt && outAt.getTime() <= inAt.getTime()) {
        throw new ValidationAppError('The requested punches leave the check-out at or before the check-in');
      }
      if (requestedCheckIn) {
        att.checkIn = { time: requestedCheckIn, method: 'manual', metadata: { regularized: true } };
      }
      if (requestedCheckOut) {
        att.checkOut = { time: requestedCheckOut, method: 'manual', metadata: { regularized: true } };
      }
      att.source = 'regularization';
      // Re-judge the day with the owner's shift, as a self-service punch would:
      // an `absent` auto row becomes present / late / half day.
      const cfg = await AttendanceConfig.findOne({}).exec();
      settleDay(att, att.checkOut?.time, await resolveShift(owner), cfg);
    } else {
      // Reason-only request: there are no times to write or judge, so the
      // approver is vouching for the day. Punches and hours stay as they are
      // (none, on an auto-absent row) and the shift rules are not run.
      att.status = 'present';
      att.source = 'regularization';
    }
    att.isRegularized = true;
  }

  const userId = getUserId();
  att.regularization.status = status;
  att.regularization.approvedAt = new Date();
  if (userId) att.regularization.approvedBy = new Types.ObjectId(userId);
  try {
    await att.save();
  } catch (err) {
    if (err instanceof Error && err.name === 'DocumentNotFoundError') {
      throw new AppError(DECIDED_MEANWHILE_MESSAGE, 409, 'DECIDED_MEANWHILE');
    }
    throw err;
  }

  void audit({
    action: 'update',
    entity: 'Attendance',
    entityId: String(att._id),
    before,
    after: {
      regularization: status,
      status: att.status,
      checkIn: att.checkIn?.time,
      checkOut: att.checkOut?.time,
      totalWorkingHours: att.totalWorkingHours,
    },
  });
  await notifyEmployeeOfRegularizationDecision(owner?.userId, att, status);
  res.json({ success: true, data: att });
}

export const correctRecordSchema = z
  .object({
    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),
    reason: z.string().min(3, 'Give a reason — it is stored on the record'),
  })
  .refine((v) => v.checkIn || v.checkOut, {
    message: 'Provide checkIn, checkOut, or both',
  });

/**
 * PATCH /api/v1/attendance/records/:id — HR corrects a check-in/check-out.
 *
 * Employees forget to check out, which leaves the day stored as 0 hours (the
 * timestamps are there but the total is only written at check-out). There was
 * no way to fix such a record: `/check-out` only ever acts on the *caller's*
 * own record, so an admin could not close someone else's day. This closes it
 * on their behalf and recomputes hours, overtime and half-day status with the
 * same rules a normal check-out uses.
 */
export async function correctRecord(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof correctRecordSchema>;
  const att = await Attendance.findById(String(req.params.id)).exec();
  if (!att) throw new NotFoundError('Attendance record not found');
  // A correction rewrites `regularization`; doing so over an open request
  // would silently discard what the employee asked for.
  if (att.regularization?.status === 'pending') {
    throw new AppError('Decide the pending regularization request first', 409, 'REGULARIZATION_PENDING');
  }

  const before = {
    checkIn: att.checkIn?.time,
    checkOut: att.checkOut?.time,
    totalWorkingHours: att.totalWorkingHours,
  };

  if (body.checkIn) {
    att.checkIn = { ...(att.checkIn ?? {}), time: body.checkIn, method: att.checkIn?.method ?? 'manual' } as any;
  }
  if (body.checkOut) {
    att.checkOut = { ...(att.checkOut ?? {}), time: body.checkOut, method: 'manual' } as any;
  }

  const inTime = att.checkIn?.time;
  const outTime = att.checkOut?.time;
  if (!inTime) throw new ValidationAppError('Record has no check-in to correct against');
  if (outTime && outTime.getTime() <= inTime.getTime()) {
    throw new ValidationAppError('Check-out must be after check-in');
  }

  // Re-judge the day from scratch with the owner's shift — the rules a
  // self-service punch uses — so an `absent` or `half_day` that the
  // corrected times no longer support becomes present / late.
  const [cfg, owner] = await Promise.all([
    AttendanceConfig.findOne({}).exec(),
    Employee.findById(att.employeeId).setOptions({ withDeleted: true }).select('shift').exec(),
  ]);
  settleDay(att, outTime, await resolveShift(owner), cfg);

  // Mark it as an HR correction so the row is not mistaken for a clean punch.
  att.isRegularized = true;
  att.regularization = {
    requestedAt: new Date(),
    reason: body.reason,
    approvedBy: getUserId() ? new Types.ObjectId(getUserId() as string) : undefined,
    approvedAt: new Date(),
    status: 'approved',
  } as any;

  await att.save();
  void audit({
    action: 'update',
    entity: 'Attendance',
    entityId: String(att._id),
    before,
    after: {
      checkIn: att.checkIn?.time,
      checkOut: att.checkOut?.time,
      totalWorkingHours: att.totalWorkingHours,
      reason: body.reason,
    },
  });
  res.json({ success: true, data: att });
}

// ============================================================================
// DAY CLOSE — replay the nightly job for past days
// ============================================================================

/** `to − from` in days: at most 62 days per backfill call. */
const MAX_CLOSE_DAYS_SPAN = 61;

const isoDay = (label: Date): string => label.toISOString().slice(0, 10);

export const closeDaySchema = z.object({
  date: z.coerce.date(),
});

export const closeDaysSchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .refine((v) => startOfBusinessDay(v.to) >= startOfBusinessDay(v.from), {
    message: '`to` must be on or after `from`',
    path: ['to'],
  })
  .refine(
    (v) =>
      (startOfBusinessDay(v.to).getTime() - startOfBusinessDay(v.from).getTime()) / DAY_MS <=
      MAX_CLOSE_DAYS_SPAN,
    { message: `At most ${MAX_CLOSE_DAYS_SPAN + 1} days per request`, path: ['to'] },
  );

/**
 * Only a day that is over can be closed. Closing today would mark everyone
 * not yet in as absent; the nightly job closes it at 23:59.
 */
function assertPastDay(label: Date): void {
  if (label.getTime() >= startOfBusinessDay(new Date()).getTime()) {
    throw new ValidationAppError(
      `${isoDay(label)} is not over yet — only past days can be closed; today closes automatically at 23:59`,
    );
  }
}

const sumCounts = (all: DayCloseCounts[]): DayCloseCounts =>
  all.reduce(
    (acc, c) => ({
      absentCreated: acc.absentCreated + c.absentCreated,
      leaveStamped: acc.leaveStamped + c.leaveStamped,
      autoCheckedOut: acc.autoCheckedOut + c.autoCheckedOut,
      skipped: acc.skipped + c.skipped,
      exitsApplied: acc.exitsApplied + c.exitsApplied,
    }),
    { absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0, exitsApplied: 0 },
  );

/**
 * Close one day and audit it. A day where some rows failed is audited too,
 * with the counts of what did succeed and the failed rows, before the error
 * propagates — so a backfill that stops midway still leaves a trail.
 */
async function closeAndAudit(day: Date, range?: { from: string; to: string }): Promise<DayCloseCounts> {
  const date = isoDay(day);
  try {
    const counts = await closeBusinessDay(day);
    void audit({ action: 'update', entity: 'Attendance', metadata: { event: 'day-close', date, ...range, counts } });
    return counts;
  } catch (err) {
    if (err instanceof DayCloseError) {
      void audit({
        action: 'update',
        entity: 'Attendance',
        metadata: { event: 'day-close', date, ...range, counts: err.counts, failures: err.failures },
      });
    }
    throw err;
  }
}

/** POST /api/v1/attendance/close-day — run the day-close for one past day. */
export async function closeDay(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof closeDaySchema>;
  const day = startOfBusinessDay(body.date);
  assertPastDay(day);

  const counts = await closeAndAudit(day);
  res.json({ success: true, data: { date: isoDay(day), ...counts } });
}

/**
 * POST /api/v1/attendance/close-days — run the day-close for every day in
 * `[from, to]` (at most 62), oldest first, and report each day's counts.
 * Each day is audited as it is closed; a failing day stops the run.
 */
export async function closeDays(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof closeDaysSchema>;
  const fromDay = startOfBusinessDay(body.from);
  const toDay = startOfBusinessDay(body.to);
  assertPastDay(toDay);
  const from = isoDay(fromDay);
  const to = isoDay(toDay);

  const days: (DayCloseCounts & { date: string })[] = [];
  for (let t = fromDay.getTime(); t <= toDay.getTime(); t += DAY_MS) {
    // Sequential on purpose: one day's rows are settled before the next.
    // eslint-disable-next-line no-await-in-loop
    const counts = await closeAndAudit(new Date(t), { from, to });
    days.push({ date: isoDay(new Date(t)), ...counts });
  }
  res.json({ success: true, data: { from, to, days, totals: sumCounts(days) } });
}

export const reportQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  departmentId: z.string().optional(),
});

export async function dashboardStats(req: Request, res: Response): Promise<void> {
  const today = startOfDay(new Date());
  const filter: Record<string, unknown> = { date: today };
  // Headcount must be counted the same way the main dashboard counts it —
  // active employees only — or the two dashboards report different totals.
  // When a department filter is applied it has to narrow the headcount too,
  // otherwise the derived absent count is nonsense.
  const employeeFilter: Record<string, unknown> = { status: 'active' };
  if (req.query.departmentId) {
    employeeFilter.department = String(req.query.departmentId);
    const empIds = await Employee.find(employeeFilter).distinct('_id');
    filter.employeeId = { $in: empIds };
  }

  const totalEmployees = await Employee.countDocuments(employeeFilter);
  const todayRecords = await Attendance.find(filter).lean().exec();
  const presentCount = todayRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
  const lateCount = todayRecords.filter((r) => r.status === 'late').length;
  const halfDayCount = todayRecords.filter((r) => r.status === 'half_day').length;

  // Approved leave lives in LeaveRequest — nothing stamps an `on_leave`
  // attendance row, so counting only those rows left this tile permanently at
  // 0 and pushed everyone on leave into the derived absent count (which is
  // why this dashboard disagreed with the main one). Read both sources and
  // de-dupe by employee, and count only employees in scope so an inactive
  // employee's leave can't inflate the tile past the headcount.
  const inScopeIds = new Set(
    (await Employee.find(employeeFilter).distinct('_id')).map((id) => String(id)),
  );
  const endOfToday = new Date(today);
  endOfToday.setHours(23, 59, 59, 999);
  const approvedLeaves = await LeaveRequest.find({
    status: 'approved',
    startDate: { $lte: endOfToday },
    endDate: { $gte: today },
  })
    .select('employeeId')
    .lean()
    .exec();
  // Someone who actually checked in is counted where they stand, not on
  // leave — otherwise the buckets overlap and absent comes out too low.
  const attendedIds = new Set(
    todayRecords
      .filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'half_day')
      .map((r) => String(r.employeeId)),
  );
  const onLeaveIds = new Set<string>();
  for (const r of todayRecords) {
    if (r.status === 'on_leave') onLeaveIds.add(String(r.employeeId));
  }
  for (const l of approvedLeaves) onLeaveIds.add(String(l.employeeId));
  const onLeaveCount = [...onLeaveIds].filter(
    (id) => inScopeIds.has(id) && !attendedIds.has(id),
  ).length;

  // On a week off nobody is expected in, so "everyone who didn't check in" is
  // not absent.
  const todayIsWeekOff = isWeekOff(today, await getWeekOffRule());
  const holidayToday = await Holiday.countDocuments({ date: today });
  const isNonWorkingDay = todayIsWeekOff || holidayToday > 0;
  const absentCount = isNonWorkingDay
    ? 0
    : totalEmployees - presentCount - halfDayCount - onLeaveCount;

  // 30-day heatmap
  const heatFrom = new Date(today);
  heatFrom.setDate(heatFrom.getDate() - 29);
  const heatRecords = await Attendance.aggregate([
    { $match: { date: { $gte: heatFrom, $lte: today } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        present: { $sum: { $cond: [{ $in: ['$status', ['present', 'late']] }, 1, 0] } },
        absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Late comers today
  const lateComers = await Attendance.find({ date: today, status: 'late' })
    .populate('employeeId', 'firstName lastName employeeId')
    .limit(10)
    .lean()
    .exec();

  res.json({
    success: true,
    data: {
      totals: {
        totalEmployees,
        present: presentCount,
        late: lateCount,
        halfDay: halfDayCount,
        onLeave: onLeaveCount,
        absent: Math.max(0, absentCount),
      },
      isNonWorkingDay,
      heatmap: heatRecords,
      lateComers,
    },
  });
}

export async function attendanceReport(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const filter: Record<string, unknown> = { date: { $gte: q.from, $lte: q.to } };
  if (q.departmentId) {
    const empIds = await Employee.find({ department: q.departmentId }).distinct('_id');
    filter.employeeId = { $in: empIds };
  }
  const records = await Attendance.find(filter)
    .populate('employeeId', 'firstName lastName employeeId department')
    .lean()
    .exec();
  void audit({ action: 'export', entity: 'Attendance' });
  res.json({ success: true, data: records });
}

// ============================================================================
// LIVE TRACKING
// ============================================================================

export const trackingBatchSchema = z.object({
  points: z.array(z.object({
    timestamp: z.coerce.date().optional(),
    lat: z.coerce.number(),
    lng: z.coerce.number(),
    accuracy: z.coerce.number().optional(),
    speed: z.coerce.number().optional(),
    altitude: z.coerce.number().optional(),
    heading: z.coerce.number().optional(),
    activity: z.enum(['still', 'walking', 'running', 'in_vehicle']).optional(),
    battery: z.coerce.number().optional(),
    isCharging: z.boolean().optional(),
    networkType: z.string().optional(),
    isOffline: z.boolean().optional(),
  })).min(1).max(500),
});

export async function ingestLocationBatch(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof trackingBatchSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ValidationAppError('Employee profile not found');

  // Admin master switch — when live tracking is turned off in the panel we
  // accept the request but store nothing, so a stale mobile client can't
  // keep writing location history.
  const cfg = await AttendanceConfig.findOne({}).exec();
  if (!cfg?.liveTracking?.enabled) {
    res.status(200).json({ success: true, ignored: true, message: 'Live tracking disabled' });
    return;
  }

  const today = startOfDay(new Date());
  const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
  if (!att || !att.checkIn?.time || att.checkOut?.time) {
    res.status(200).json({ success: true, ignored: true, message: 'Not clocked in' });
    return;
  }

  const docs = body.points.map((p) => ({
    employeeId: emp.id,
    timestamp: p.timestamp ?? new Date(),
    location: {
      type: 'Point' as const,
      coordinates: [p.lng, p.lat] as [number, number],
    },
    accuracy: p.accuracy,
    speed: p.speed,
    altitude: p.altitude,
    heading: p.heading,
    activity: p.activity,
    battery: p.battery,
    isCharging: p.isCharging,
    networkType: p.networkType,
    isOffline: p.isOffline,
    syncedAt: new Date(),
  }));

  await LocationTrack.insertMany(docs);

  const ns = getFieldTrackingNamespace();
  if (ns) {
    const latest = body.points[body.points.length - 1];
    // Broadast globally to all admins in this namespace
    ns.emit('location:update', {
      employeeId: emp.id,
      lat: latest.lat,
      lng: latest.lng,
      timestamp: latest.timestamp ?? new Date(),
      activity: latest.activity,
      battery: latest.battery,
      speed: latest.speed,
    });
  }

  res.status(201).json({ success: true, data: { ingested: docs.length } });
}

export async function getLiveTracking(_req: Request, res: Response): Promise<void> {
  // Same day label as every other attendance query — with the old
  // server-local version this looked up *yesterday* between 00:00 and 05:30
  // IST and showed a stale set of "currently working" people.
  const start = startOfBusinessDay(new Date());

  const todayRecords = await Attendance.find({
    date: start,
    'checkIn.time': { $exists: true },
    'checkOut.time': { $exists: false }
  }).distinct('employeeId');

  if (todayRecords.length === 0) {
    res.json({ success: true, data: [] });
    return;
  }

  const docs = await LocationTrack.aggregate([
    { $match: { timestamp: { $gte: start }, employeeId: { $in: todayRecords } } },
    { $sort: { timestamp: -1 } },
    {
      $group: {
        _id: '$employeeId',
        timestamp: { $first: '$timestamp' },
        location: { $first: '$location' },
        battery: { $first: '$battery' },
        activity: { $first: '$activity' },
        speed: { $first: '$speed' },
      },
    },
  ]);

  const empIds = docs.map((d) => d._id);
  const employees = await Employee.find({ _id: { $in: empIds } })
    .select('firstName lastName employeeId avatar department')
    .exec();
  const empMap = new Map(employees.map((e) => [String(e._id), e]));

  const enriched = docs.map((d) => ({
    employeeId: d._id,
    employee: empMap.get(String(d._id)),
    timestamp: d.timestamp,
    lng: d.location.coordinates[0],
    lat: d.location.coordinates[1],
    battery: d.battery,
    activity: d.activity,
    speed: d.speed,
  }));

  res.json({ success: true, data: enriched });
}

