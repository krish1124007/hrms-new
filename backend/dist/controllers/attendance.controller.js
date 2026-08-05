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
import { getWeekOffRule, invalidateWeekOffRule } from '../services/week-off.service.js';
import { AppError, NotFoundError, ValidationAppError, ForbiddenError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
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
        requireNoteOnLateCheckIn: z.boolean().default(false),
        freeLateDaysPerMonth: z.number().int().min(0).default(3),
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
            .array(z.object({
            day: z.number().int().min(0).max(6),
            weeks: z.array(z.number().int().min(1).max(5)).default([]),
        }))
            .default([]),
    })
        .partial()
        .optional(),
});
export async function getConfig(_req, res) {
    let cfg = await AttendanceConfig.findOne({}).exec();
    if (!cfg) {
        cfg = await AttendanceConfig.create({ enabledMethods: ['manual'], settings: {} });
    }
    res.json({ success: true, data: cfg });
}
export async function updateConfig(req, res) {
    const body = req.body;
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
function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function haversineMeters(a, b) {
    const R = 6371000;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
}
function pointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng;
        const yi = polygon[i].lat;
        const xj = polygon[j].lng;
        const yj = polygon[j].lat;
        const intersect = yi > point.lat !== yj > point.lat && point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
        if (intersect)
            inside = !inside;
    }
    return inside;
}
function ipToLong(ip) {
    return ip.split('.').reduce((acc, oct) => acc * 256 + parseInt(oct, 10), 0);
}
async function getCurrentEmployee() {
    const userId = getUserId();
    if (!userId)
        return null;
    const emp = await Employee.findOne({ userId }).exec();
    return emp ? { id: emp._id, doc: emp } : null;
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
employee, location, action) {
    if (!employee?.requireLocation)
        return;
    const hasFix = typeof location?.lat === 'number' && typeof location?.lng === 'number';
    if (!hasFix) {
        throw new AppError(`Location sharing is required for you to ${action}. Enable location access and try again.`, 400, 'LOCATION_REQUIRED');
    }
}
async function validateMethod(method, body, req) {
    const cfg = await AttendanceConfig.findOne({}).exec();
    if (cfg && !cfg.enabledMethods.includes(method)) {
        throw new ValidationAppError(`Check-in method '${method}' is not enabled for this tenant`);
    }
    const metadata = {};
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
            if (!body.qrCode)
                throw new ValidationAppError('qrCode is required');
            const qr = await QRCode.findOne({ code: body.qrCode, type: 'static', isActive: true }).exec();
            if (!qr)
                throw new ValidationAppError('Invalid or inactive QR code');
            if (qr.expiresAt && qr.expiresAt < new Date())
                throw new ValidationAppError('QR code expired');
            metadata.qrCodeId = String(qr._id);
            if (qr.locationId)
                metadata.siteId = String(qr.locationId);
            break;
        }
        case 'dynamic_qr': {
            if (!body.qrCode)
                throw new ValidationAppError('qrCode is required');
            const qr = await QRCode.findOne({ code: body.qrCode, type: 'dynamic', isActive: true }).exec();
            if (!qr)
                throw new ValidationAppError('Invalid dynamic QR code');
            if (!qr.expiresAt || qr.expiresAt < new Date()) {
                throw new ValidationAppError('Dynamic QR code expired — please scan the latest code');
            }
            metadata.qrCodeId = String(qr._id);
            break;
        }
        case 'ip': {
            const reqIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                req.socket.remoteAddress ||
                '';
            const cleanIp = reqIp.replace(/^::ffff:/, '');
            const allowed = await AllowedIP.find({ isActive: true }).exec();
            const matched = allowed.find((entry) => {
                if (entry.ipAddress && entry.ipAddress === cleanIp)
                    return true;
                if (entry.ipRangeStart && entry.ipRangeEnd) {
                    try {
                        const ip = ipToLong(cleanIp);
                        return ip >= ipToLong(entry.ipRangeStart) && ip <= ipToLong(entry.ipRangeEnd);
                    }
                    catch {
                        return false;
                    }
                }
                return false;
            });
            if (!matched)
                throw new ValidationAppError(`IP ${cleanIp} not in allowed list`);
            metadata.ipAddress = cleanIp;
            break;
        }
        case 'site': {
            if (!body.siteId)
                throw new ValidationAppError('siteId is required');
            if (!body.location?.lat || !body.location?.lng) {
                throw new ValidationAppError('Location is required for site check-in');
            }
            const site = await AttendanceSite.findById(body.siteId).exec();
            if (!site || !site.isActive)
                throw new ValidationAppError('Site not found or inactive');
            const dist = haversineMeters({ lat: body.location.lat, lng: body.location.lng }, { lat: site.location.lat, lng: site.location.lng });
            if (dist > site.radius) {
                throw new ValidationAppError(`You are ${Math.round(dist)}m from site '${site.name}' (allowed: ${site.radius}m)`);
            }
            metadata.siteId = String(site._id);
            break;
        }
        case 'geofence': {
            if (!body.geofenceId)
                throw new ValidationAppError('geofenceId is required');
            if (!body.location?.lat || !body.location?.lng) {
                throw new ValidationAppError('Location is required for geofence check-in');
            }
            const zone = await GeofenceZone.findById(body.geofenceId).exec();
            if (!zone || !zone.isActive)
                throw new ValidationAppError('Geofence zone not found or inactive');
            const point = { lat: body.location.lat, lng: body.location.lng };
            let inside = false;
            if (zone.type === 'circle' && zone.center && zone.radius) {
                inside = haversineMeters(point, zone.center) <= zone.radius;
            }
            else if (zone.type === 'polygon' && zone.coordinates.length >= 3) {
                inside = pointInPolygon(point, zone.coordinates);
            }
            if (!inside)
                throw new ValidationAppError(`You are outside geofence '${zone.name}'`);
            metadata.geofenceId = String(zone._id);
            break;
        }
        case 'device': {
            if (!body.deviceId)
                throw new ValidationAppError('deviceId is required');
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
export async function checkIn(req, res) {
    const body = req.body;
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const cfg = await AttendanceConfig.findOne({}).exec();
    if (cfg?.settings.requirePhotoOnCheckIn && !body.photo) {
        throw new ValidationAppError('Photo is required for check-in');
    }
    assertLocationIfRequired(emp.doc, body.location, 'check in');
    const { metadata } = await validateMethod(body.method, body, req);
    const today = startOfDay(new Date());
    let att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
    if (att?.checkIn?.time) {
        throw new ValidationAppError('Already checked in today');
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
    }
    else {
        att.checkIn = checkInRecord;
        att.status = lateBy > 0 ? 'late' : 'present';
        att.lateBy = lateBy;
        await att.save();
    }
    void audit({ action: 'create', entity: 'Attendance', entityId: String(att._id), after: { method: body.method } });
    res.status(201).json({ success: true, data: att });
}
/** Same calendar day in server-local time — matches how `date` is stored. */
function isSameDay(a, b) {
    return (a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate());
}
const ms = (v) => v ? new Date(v).getTime() : null;
/** Worked milliseconds between check-in and `until`, minus break time. */
function workedMs(att, until) {
    const inMs = ms(att.checkIn?.time);
    if (inMs === null)
        return 0;
    const outMs = ms(att.checkOut?.time) ?? until.getTime();
    const breakMs = (att.breaks ?? []).reduce((acc, b) => {
        const start = ms(b.startTime);
        if (start === null)
            return acc;
        // An open break is still running — count it up to `until`, otherwise a
        // check-out taken mid-break silently credited the whole break as work.
        const end = ms(b.endTime) ?? Math.min(outMs, until.getTime());
        return acc + Math.max(0, end - start);
    }, 0);
    return Math.max(0, outMs - inMs - breakMs);
}
/** Worked hours, rounded to 2 decimals — the unit `totalWorkingHours` uses. */
function workedHours(att, until = new Date()) {
    return +(workedMs(att, until) / 3_600_000).toFixed(2);
}
/**
 * Fill in `totalWorkingHours` for a day that is still running. Finished days
 * keep their stored value; nothing is written back to the database.
 */
function withLiveHours(att, now = new Date()) {
    if (!att?.checkIn?.time || att.checkOut?.time)
        return att;
    // ONLY today's row is genuinely in progress. An older record with no
    // check-out is a forgotten check-out, and treating it as "still running"
    // grows without bound — a day missed in August reported 44.67 hours and
    // climbing, which then inflated every month total built from these rows.
    // Leave such records on their stored value so they stay visible as the
    // anomaly they are and can be regularised.
    const recordDay = att.date ? new Date(att.date) : new Date(att.checkIn.time);
    if (!isSameDay(recordDay, now))
        return att;
    // Callers hand us either lean objects or hydrated documents (paginate()
    // does not lean). Spreading a document would serialise its internals, so
    // convert first.
    const asDoc = att;
    const plain = typeof asDoc.toObject === 'function' ? asDoc.toObject() : att;
    return { ...plain, totalWorkingHours: workedHours(att, now) };
}
export async function checkOut(req, res) {
    const body = req.body;
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const today = startOfDay(new Date());
    const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
    if (!att || !att.checkIn?.time)
        throw new ValidationAppError('You must check in first');
    if (att.checkOut?.time)
        throw new ValidationAppError('Already checked out today');
    assertLocationIfRequired(emp.doc, body.location, 'check out');
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
        throw new AppError("Submit today's expense entry before checking out.", 400, 'EXPENSE_REQUIRED_FOR_CHECKOUT');
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
    };
    // total working hours = (out - in) - break time, including a break that is
    // still open at check-out (previously such a break was never deducted).
    att.totalWorkingHours = workedHours(att, now);
    const workMs = att.totalWorkingHours * 3_600_000;
    const cfg = await AttendanceConfig.findOne({}).exec();
    const otThresholdMin = cfg?.settings.overtimeThresholdMinutes ?? 540;
    const halfDayHours = cfg?.settings.halfDayThresholdHours ?? 4;
    const workMin = workMs / 60_000;
    if (workMin > otThresholdMin) {
        att.overtimeHours = +((workMin - otThresholdMin) / 60).toFixed(2);
    }
    if (att.totalWorkingHours < halfDayHours) {
        att.status = 'half_day';
    }
    await att.save();
    void audit({ action: 'update', entity: 'Attendance', entityId: String(att._id), after: { checkOut: now } });
    res.json({ success: true, data: att });
}
export async function startBreak(req, res) {
    const body = req.body;
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const today = startOfDay(new Date());
    const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
    if (!att?.checkIn?.time)
        throw new ValidationAppError('Check in first');
    if (att.checkOut?.time)
        throw new ValidationAppError('Already checked out');
    const open = att.breaks.find((b) => !b.endTime);
    if (open)
        throw new ValidationAppError('A break is already in progress');
    att.breaks.push({ startTime: new Date(), type: body.type });
    await att.save();
    res.status(201).json({ success: true, data: att });
}
export async function endBreak(_req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const today = startOfDay(new Date());
    const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
    if (!att)
        throw new ValidationAppError('No attendance record');
    const open = att.breaks.find((b) => !b.endTime);
    if (!open)
        throw new ValidationAppError('No active break');
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
function dateRangeFilter(q) {
    if (q.month) {
        const [year, month] = q.month.split('-').map(Number);
        return {
            $gte: new Date(year, month - 1, 1),
            // Day 0 of the next month is the last day of this one.
            $lte: new Date(year, month, 0, 23, 59, 59, 999),
        };
    }
    if (q.from || q.to) {
        const range = {};
        if (q.from)
            range.$gte = q.from;
        if (q.to)
            range.$lte = q.to;
        return range;
    }
    return undefined;
}
async function loadKnownAreas() {
    const [sites, zones] = await Promise.all([
        AttendanceSite.find({ isActive: true }).select('name location radius').lean().exec(),
        GeofenceZone.find({}).select('name center radius').lean().exec(),
    ]);
    const areas = [];
    for (const s of sites) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const loc = s.location;
        if (typeof loc?.lat === 'number' && typeof loc?.lng === 'number') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            areas.push({ name: s.name, lat: loc.lat, lng: loc.lng, radius: s.radius ?? 100 });
        }
    }
    for (const z of zones) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const c = z.center;
        if (typeof c?.lat === 'number' && typeof c?.lng === 'number') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            areas.push({ name: z.name, lat: c.lat, lng: c.lng, radius: z.radius ?? 200 });
        }
    }
    return areas;
}
/**
 * Nearest configured area to a point: its name, the distance in metres, and
 * whether the point is inside the area's radius. Null when there are no
 * coordinates or no areas configured — the UI then falls back to lat/lng.
 */
function describeArea(loc, areas) {
    if (typeof loc?.lat !== 'number' || typeof loc?.lng !== 'number' || areas.length === 0) {
        return null;
    }
    let best = null;
    for (const a of areas) {
        const distance = Math.round(haversineMeters({ lat: loc.lat, lng: loc.lng }, a));
        if (!best || distance < best.distance) {
            best = { name: a.name, distance, inside: distance <= a.radius };
        }
    }
    return best;
}
export async function listRecords(req, res) {
    const q = req.query;
    const filter = {};
    if (q.employeeId)
        filter.employeeId = new Types.ObjectId(q.employeeId);
    if (q.status)
        filter.status = q.status;
    const dateFilter = dateRangeFilter(q);
    if (dateFilter)
        filter.date = dateFilter;
    let validEmpIds = null;
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
        }
        else {
            validEmpIds = matchedStrs;
        }
    }
    if (validEmpIds !== null) {
        if (filter.employeeId) {
            const targetStr = filter.employeeId.toString();
            if (!validEmpIds.includes(targetStr)) {
                filter.employeeId = new Types.ObjectId('000000000000000000000000');
            }
        }
        else {
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
        const row = withLiveHours(r);
        // withLiveHours already converted in-progress rows; convert the rest.
        const plain = typeof row.toObject === 'function'
            ? row.toObject()
            : { ...row };
        return {
            ...plain,
            checkInArea: describeArea(row.checkIn?.location, areas),
            checkOutArea: describeArea(row.checkOut?.location, areas),
        };
    });
    res.json({ success: true, data, pagination: result.pagination });
}
export async function myAttendance(req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const q = req.query;
    const filter = { employeeId: emp.id };
    const dateFilter = dateRangeFilter(q);
    if (dateFilter)
        filter.date = dateFilter;
    const result = await Attendance.paginate(filter, {
        page: q.page ?? 1,
        limit: q.limit ?? 50,
        sort: '-date',
    });
    // Today's row is still running until check-out — report hours so far so the
    // month summary built from this list isn't missing today's work.
    const data = result.data.map((r) => withLiveHours(r));
    res.json({ success: true, data, pagination: result.pagination });
}
export async function todayAttendance(_req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const today = startOfDay(new Date());
    const att = await Attendance.findOne({ employeeId: emp.id, date: today }).lean().exec();
    // Hours-so-far for a day still in progress — this is the record every
    // "Hours today" tile on web and mobile reads.
    res.json({ success: true, data: att ? withLiveHours(att) : null });
}
export async function myShift(_req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
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
    employeeId: z.string().optional(),
});
export async function monthlyAttendance(req, res) {
    const q = req.query;
    let employeeId;
    if (q.employeeId) {
        employeeId = new Types.ObjectId(q.employeeId);
    }
    else {
        const emp = await getCurrentEmployee();
        if (!emp)
            throw new ForbiddenError('No employee profile found for current user');
        employeeId = emp.id;
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
    const filled = [...records];
    const lastDay = new Date(q.year, q.month, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
        const day = new Date(q.year, q.month - 1, d);
        const key = toKey(day);
        if (stored.has(key))
            continue;
        const isHoliday = holidaySet.has(key);
        if (!isHoliday && !isWeekOff(day, rule))
            continue;
        filled.push({
            // Synthetic, never persisted — derived from the calendar, not the DB.
            _id: `virtual-${key}`,
            employeeId,
            date: day,
            status: isHoliday ? 'holiday' : 'weekend',
            isVirtual: true,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        });
    }
    filled.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    // Same as /my — today's row is still open, so report hours so far. The
    // mobile month summary is built from this endpoint.
    const withHours = filled.map((r) => withLiveHours(r));
    res.json({ success: true, data: withHours });
}
export const regularizeSchema = z.object({
    date: z.coerce.date(),
    reason: z.string().min(3),
});
export async function requestRegularization(req, res) {
    const body = req.body;
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const date = startOfDay(body.date);
    let att = await Attendance.findOne({ employeeId: emp.id, date }).exec();
    if (!att) {
        att = await Attendance.create({ employeeId: emp.id, date, status: 'absent' });
    }
    att.regularization = {
        requestedAt: new Date(),
        reason: body.reason,
        status: 'pending',
    };
    att.isRegularized = false;
    await att.save();
    res.status(201).json({ success: true, data: att });
}
export const approveRegularizationSchema = z.object({
    status: z.enum(['approved', 'rejected']),
});
export async function decideRegularization(req, res) {
    const { status } = req.body;
    const att = await Attendance.findById(String(req.params.id)).exec();
    if (!att)
        throw new NotFoundError('Attendance record not found');
    if (!att.regularization)
        throw new ValidationAppError('No regularization request on this record');
    const userId = getUserId();
    att.regularization.status = status;
    att.regularization.approvedAt = new Date();
    if (userId)
        att.regularization.approvedBy = new Types.ObjectId(userId);
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
export async function correctRecord(req, res) {
    const body = req.body;
    const att = await Attendance.findById(String(req.params.id)).exec();
    if (!att)
        throw new NotFoundError('Attendance record not found');
    const before = {
        checkIn: att.checkIn?.time,
        checkOut: att.checkOut?.time,
        totalWorkingHours: att.totalWorkingHours,
    };
    if (body.checkIn) {
        att.checkIn = { ...(att.checkIn ?? {}), time: body.checkIn, method: att.checkIn?.method ?? 'manual' };
    }
    if (body.checkOut) {
        att.checkOut = { ...(att.checkOut ?? {}), time: body.checkOut, method: 'manual' };
    }
    const inTime = att.checkIn?.time;
    const outTime = att.checkOut?.time;
    if (!inTime)
        throw new ValidationAppError('Record has no check-in to correct against');
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
        att.totalWorkingHours = workedHours(att, outTime);
        const cfg = await AttendanceConfig.findOne({}).exec();
        const otThresholdMin = cfg?.settings.overtimeThresholdMinutes ?? 540;
        const halfDayHours = cfg?.settings.halfDayThresholdHours ?? 4;
        const workMin = att.totalWorkingHours * 60;
        att.overtimeHours = workMin > otThresholdMin ? +((workMin - otThresholdMin) / 60).toFixed(2) : 0;
        if (att.status === 'absent' || att.status === 'half_day')
            att.status = 'present';
        if (att.totalWorkingHours < halfDayHours)
            att.status = 'half_day';
    }
    else if (att.status === 'absent') {
        // Clock-in set on its own (employee forgot to punch in): they were here,
        // so the day is no longer absent. Hours stay derived until they check out.
        att.status = 'present';
    }
    // Mark it as an HR correction so the row is not mistaken for a clean punch.
    att.isRegularized = true;
    att.regularization = {
        requestedAt: new Date(),
        reason: body.reason,
        approvedBy: getUserId() ? new Types.ObjectId(getUserId()) : undefined,
        approvedAt: new Date(),
        status: 'approved',
    };
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
export const reportQuerySchema = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    departmentId: z.string().optional(),
});
export async function dashboardStats(req, res) {
    const today = startOfDay(new Date());
    const filter = { date: today };
    // Headcount must be counted the same way the main dashboard counts it —
    // active employees only — or the two dashboards report different totals.
    // When a department filter is applied it has to narrow the headcount too,
    // otherwise the derived absent count is nonsense.
    const employeeFilter = { status: 'active' };
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
    const inScopeIds = new Set((await Employee.find(employeeFilter).distinct('_id')).map((id) => String(id)));
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
    const attendedIds = new Set(todayRecords
        .filter((r) => r.status === 'present' || r.status === 'late' || r.status === 'half_day')
        .map((r) => String(r.employeeId)));
    const onLeaveIds = new Set();
    for (const r of todayRecords) {
        if (r.status === 'on_leave')
            onLeaveIds.add(String(r.employeeId));
    }
    for (const l of approvedLeaves)
        onLeaveIds.add(String(l.employeeId));
    const onLeaveCount = [...onLeaveIds].filter((id) => inScopeIds.has(id) && !attendedIds.has(id)).length;
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
export async function attendanceReport(req, res) {
    const q = req.query;
    const filter = { date: { $gte: q.from, $lte: q.to } };
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
export async function ingestLocationBatch(req, res) {
    const body = req.body;
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ValidationAppError('Employee profile not found');
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
            type: 'Point',
            coordinates: [p.lng, p.lat],
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
export async function getLiveTracking(_req, res) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
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
//# sourceMappingURL=attendance.controller.js.map