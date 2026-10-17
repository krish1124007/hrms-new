import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Attendance } from '../models/attendance.model.js';
import { QRCode } from '../models/qr-code.model.js';
import { GeofenceZone } from '../models/geofence-zone.model.js';
import { AttendanceSite } from '../models/attendance-site.model.js';
import { AllowedIP } from '../models/allowed-ip.model.js';
import { Employee } from '../models/employee.model.js';
import { Shift } from '../models/shift.model.js';
import { Holiday } from '../models/holiday.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { isWeekOff, toKey } from '../lib/week-off.js';
import { startOfBusinessDay } from '../lib/business-day.js';
import { applyShiftRules, computeHours, type WorkedHoursSource } from '../lib/attendance-hours.js';
import { getWeekOffRule, invalidateWeekOffRule } from '../services/week-off.service.js';
import { closeBusinessDay, type DayCloseCounts } from '../services/day-close.service.js';
import { AppError, NotFoundError, ValidationAppError, ForbiddenError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { currentEmployeeId, hasPermission } from '../lib/access.js';
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

async function validateMethod(
  method: string,
  body: z.infer<typeof checkInSchema>,
  req: Request,
): Promise<{ metadata: Record<string, unknown> }> {
  const cfg = await AttendanceConfig.findOne({}).exec();
  if (cfg && !cfg.enabledMethods.includes(method as any)) {
    throw new ValidationAppError(`Check-in method '${method}' is not enabled for this tenant`);
  }
  const metadata: Record<string, unknown> = {};

  switch (method) {
    case 'face': {
      if (typeof body.faceConfidence !== 'number' || body.faceConfidence < 0.85) {
        throw new ValidationAppError('Face match confidence below threshold (0.85)');
      }
      if (body.liveness === false) {
        throw new ValidationAppError('Liveness check failed');
      }
      metadata.faceConfidence = body.faceConfidence;
      break;
    }
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
      const reqIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
        req.socket.remoteAddress ||
        '';
      const cleanIp = reqIp.replace(/^::ffff:/, '');
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
      // Manual check-in still records where the employee clocked in from so
      // we always know the start point of the day. Location is mandatory.
      // TEMPORARILY DISABLED: Location is not required for manual check-in
      /*
      if (typeof body.location?.lat !== 'number' || typeof body.location?.lng !== 'number') {
        throw new ValidationAppError('Location is required for manual check-in');
      }
      */
      break;
    }
  }
  return { metadata };
}

export async function checkIn(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkInSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const cfg = await AttendanceConfig.findOne({}).exec();
  if (cfg?.settings.requirePhotoOnCheckIn && !body.photo) {
    throw new ValidationAppError('Photo is required for check-in');
  }
  assertLocationIfRequired(emp.doc, body.location, 'check in', cfg?.settings.requireLocation);

  const { metadata } = await validateMethod(body.method, body, req);

  const today = startOfDay(new Date());
  let att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
  if (att?.checkIn?.time) {
    throw new ValidationAppError(
      `Already checked in today at ${formatPunchTime(att.checkIn.time)}.`,
    );
  }

  const now = new Date();
  // late by calculation against shift start
  let lateBy = 0;
  if (emp.doc.shift) {
    const shift = await Shift.findById(emp.doc.shift).exec();
    if (shift?.startTime) {
      const [h, m] = String(shift.startTime).split(':').map(Number);
      const shiftMinutes = (h || 0) * 60 + (m || 0);

      const tz = process.env.TIMEZONE || 'Asia/Kolkata';
      const nowTimeStr = now.toLocaleTimeString('en-US', {
        timeZone: tz,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
      });
      const [nowH, nowM] = nowTimeStr.split(':').map(Number);
      // toLocaleTimeString can return 24 for midnight in some Node versions when hour12: false
      const nowMinutes = (nowH === 24 ? 0 : nowH) * 60 + nowM;

      const toleranceMinutes = cfg?.settings.lateMarkAfterMinutes ?? 15;
      
      // If shift doesn't span midnight, simple check
      if (nowMinutes > shiftMinutes + toleranceMinutes) {
        lateBy = nowMinutes - shiftMinutes;
      }
    }
  }

  const checkInRecord = {
    time: now,
    method: body.method,
    location: body.location,
    photo: body.photo,
    deviceInfo: body.deviceInfo,
    metadata,
  };

  if (!att) {
    att = await Attendance.create({
      employeeId: emp.id,
      date: today,
      checkIn: checkInRecord,
      status: lateBy > 0 ? 'late' : 'present',
      lateBy,
    });
  } else {
    att.checkIn = checkInRecord as any;
    att.status = lateBy > 0 ? 'late' : 'present';
    att.lateBy = lateBy;
    await att.save();
  }

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
 * Fill in `totalWorkingHours` for a day that is still running. Finished days
 * keep their stored value; nothing is written back to the database.
 */
function withLiveHours<T extends WorkedHoursSource>(att: T, now: Date = new Date()): T {
  if (!att?.checkIn?.time || att.checkOut?.time) return att;
  // ONLY today's row is genuinely in progress. An older record with no
  // check-out is a forgotten check-out, and treating it as "still running"
  // grows without bound — a day missed in August reported 44.67 hours and
  // climbing, which then inflated every month total built from these rows.
  // Leave such records on their stored value so they stay visible as the
  // anomaly they are and can be regularised.
  // `date` is already a UTC-midnight day label; a bare timestamp has to be
  // resolved to one first. Compare against today's label in business time.
  const recordLabel = att.date
    ? new Date(att.date)
    : startOfBusinessDay(new Date(att.checkIn.time as string));
  if (recordLabel.getTime() !== startOfBusinessDay(now).getTime()) return att;
  // Callers hand us either lean objects or hydrated documents (paginate()
  // does not lean). Spreading a document would serialise its internals, so
  // convert first.
  const asDoc = att as unknown as { toObject?: () => T };
  const plain = typeof asDoc.toObject === 'function' ? asDoc.toObject() : att;
  return { ...plain, totalWorkingHours: computeHours(att, now) };
}

export async function checkOut(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof checkOutSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const today = startOfDay(new Date());
  const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
  if (!att || !att.checkIn?.time) throw new ValidationAppError('You must check in first');
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
  assertLocationIfRequired(emp.doc, body.location, 'check out', cfg?.settings.requireLocation);

  // Company policy: every check-out must be preceded by an expense claim
  // for the day. The frontend opens an expense form when this 400 fires.
  // The error code `EXPENSE_REQUIRED_FOR_CHECKOUT` is the contract — the
  // mobile + web clients trigger their submission flow on it.
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const todaysExpense = await ExpenseClaim.findOne({
    employeeId: emp.id,
    date: { $gte: today, $lt: tomorrow },
    isDeleted: { $ne: true },
  })
    .select('_id')
    .lean()
    .exec();
  if (!todaysExpense) {
    throw new AppError(
      "Submit today's expense entry before checking out.",
      400,
      'EXPENSE_REQUIRED_FOR_CHECKOUT',
    );
  }

  const { metadata } = await validateMethod(body.method, body, req);

  const now = new Date();
  att.checkOut = {
    time: now,
    method: body.method,
    location: body.location,
    photo: body.photo,
    deviceInfo: body.deviceInfo,
    metadata,
  } as any;

  // total working hours = (out - in) - break time, including a break that is
  // still open at check-out (previously such a break was never deducted).
  att.totalWorkingHours = computeHours(att, now);
  // Overtime and half-day from the configured thresholds (no shift passed:
  // check-out has always judged the day on the config values).
  applyShiftRules(att, null, cfg);

  await att.save();
  void audit({ action: 'update', entity: 'Attendance', entityId: String(att._id), after: { checkOut: now } });
  res.json({ success: true, data: att });
}

export async function startBreak(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof breakStartSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const today = startOfDay(new Date());
  const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
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

  const today = startOfDay(new Date());
  const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
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
  const data = result.data.map((r) => {
    const row = withLiveHours(r as WorkedHoursSource) as WorkedHoursSource & {
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
  // Today's row is still running until check-out — report hours so far so the
  // month summary built from this list isn't missing today's work.
  const data = result.data.map((r) => withLiveHours(r as WorkedHoursSource));
  res.json({ success: true, data, pagination: result.pagination });
}

export async function todayAttendance(_req: Request, res: Response): Promise<void> {
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');
  const today = startOfDay(new Date());
  const att = await Attendance.findOne({ employeeId: emp.id, date: today }).lean().exec();
  // Hours-so-far for a day still in progress — this is the record every
  // "Hours today" tile on web and mobile reads.
  res.json({ success: true, data: att ? withLiveHours(att) : null });
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

  // Same as /my — today's row is still open, so report hours so far. The
  // mobile month summary is built from this endpoint.
  const withHours = filled.map((r) => withLiveHours(r as WorkedHoursSource));

  res.json({ success: true, data: withHours });
}

export const regularizeSchema = z.object({
  date: z.coerce.date(),
  reason: z.string().min(3),
});

export async function requestRegularization(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof regularizeSchema>;
  const emp = await getCurrentEmployee();
  if (!emp) throw new ForbiddenError('No employee profile found for current user');

  const date = startOfDay(body.date);
  let att = await Attendance.findOne({ employeeId: emp.id, date }).exec();
  if (!att) {
    att = await Attendance.create({ employeeId: emp.id, date, status: 'absent' });
  }
  att.regularization = {
    requestedAt: new Date(),
    reason: body.reason,
    status: 'pending',
  } as any;
  att.isRegularized = false;
  await att.save();
  res.status(201).json({ success: true, data: att });
}

export const approveRegularizationSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export async function decideRegularization(req: Request, res: Response): Promise<void> {
  const { status } = req.body as z.infer<typeof approveRegularizationSchema>;
  const att = await Attendance.findById(String(req.params.id)).exec();
  if (!att) throw new NotFoundError('Attendance record not found');
  if (!att.regularization) throw new ValidationAppError('No regularization request on this record');

  const userId = getUserId();
  att.regularization.status = status;
  att.regularization.approvedAt = new Date();
  if (userId) att.regularization.approvedBy = new Types.ObjectId(userId);
  if (status === 'approved') {
    att.isRegularized = true;
    att.status = 'present';
  }
  await att.save();
  void audit({ action: 'update', entity: 'Attendance', entityId: String(att._id), after: { regularization: status } });
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

  // Close any break left open, so it is deducted rather than counted as work.
  if (outTime) {
    for (const b of att.breaks) {
      if (b.startTime && !b.endTime) {
        b.endTime = outTime < b.startTime ? b.startTime : outTime;
        b.duration = Math.round((b.endTime.getTime() - b.startTime.getTime()) / 60_000);
      }
    }
  }

  if (outTime) {
    att.totalWorkingHours = computeHours(att, outTime);
    const cfg = await AttendanceConfig.findOne({}).exec();
    const otThresholdMin = cfg?.settings.overtimeThresholdMinutes ?? 540;
    const halfDayHours = cfg?.settings.halfDayThresholdHours ?? 4;
    const workMin = att.totalWorkingHours * 60;
    att.overtimeHours = workMin > otThresholdMin ? +((workMin - otThresholdMin) / 60).toFixed(2) : 0;
    if (att.status === 'absent' || att.status === 'half_day') att.status = 'present';
    if (att.totalWorkingHours < halfDayHours) att.status = 'half_day';
  } else if (att.status === 'absent') {
    // Clock-in set on its own (employee forgot to punch in): they were here,
    // so the day is no longer absent. Hours stay derived until they check out.
    att.status = 'present';
  }

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

const DAY_MS = 24 * 60 * 60 * 1000;
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
    }),
    { absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 },
  );

/** POST /api/v1/attendance/close-day — run the day-close for one past day. */
export async function closeDay(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof closeDaySchema>;
  const day = startOfBusinessDay(body.date);
  assertPastDay(day);

  const counts = await closeBusinessDay(day);
  const date = isoDay(day);
  void audit({ action: 'update', entity: 'Attendance', metadata: { event: 'day-close', date, counts } });
  res.json({ success: true, data: { date, ...counts } });
}

/**
 * POST /api/v1/attendance/close-days — run the day-close for every day in
 * `[from, to]` (at most 62), oldest first, and report each day's counts.
 */
export async function closeDays(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof closeDaysSchema>;
  const fromDay = startOfBusinessDay(body.from);
  const toDay = startOfBusinessDay(body.to);
  assertPastDay(toDay);

  const days: (DayCloseCounts & { date: string })[] = [];
  for (let t = fromDay.getTime(); t <= toDay.getTime(); t += DAY_MS) {
    // Sequential on purpose: one day's rows are settled before the next.
    // eslint-disable-next-line no-await-in-loop
    const counts = await closeBusinessDay(new Date(t));
    days.push({ date: isoDay(new Date(t)), ...counts });
  }
  const totals = sumCounts(days);
  const from = isoDay(fromDay);
  const to = isoDay(toDay);
  void audit({
    action: 'update',
    entity: 'Attendance',
    metadata: { event: 'day-close', from, to, counts: totals },
  });
  res.json({ success: true, data: { from, to, days, totals } });
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

