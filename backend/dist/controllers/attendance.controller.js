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
import { ExpenseClaim } from '../models/expense-claim.model.js';
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
export const checkOutSchema = checkInSchema;
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
    // total working hours = (out - in) - sum(break durations)
    const inMs = att.checkIn.time.getTime();
    const outMs = now.getTime();
    const breakMs = att.breaks.reduce((acc, b) => {
        if (b.startTime && b.endTime)
            return acc + (b.endTime.getTime() - b.startTime.getTime());
        return acc;
    }, 0);
    const workMs = Math.max(0, outMs - inMs - breakMs);
    att.totalWorkingHours = +(workMs / 3_600_000).toFixed(2);
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
});
export async function listRecords(req, res) {
    const q = req.query;
    const filter = {};
    if (q.employeeId)
        filter.employeeId = new Types.ObjectId(q.employeeId);
    if (q.status)
        filter.status = q.status;
    if (q.from || q.to) {
        const dateFilter = {};
        if (q.from)
            dateFilter.$gte = q.from;
        if (q.to)
            dateFilter.$lte = q.to;
        filter.date = dateFilter;
    }
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
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myAttendance(req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const q = req.query;
    const filter = { employeeId: emp.id };
    if (q.from || q.to) {
        const dateFilter = {};
        if (q.from)
            dateFilter.$gte = q.from;
        if (q.to)
            dateFilter.$lte = q.to;
        filter.date = dateFilter;
    }
    const result = await Attendance.paginate(filter, {
        page: q.page ?? 1,
        limit: q.limit ?? 50,
        sort: '-date',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function todayAttendance(_req, res) {
    const emp = await getCurrentEmployee();
    if (!emp)
        throw new ForbiddenError('No employee profile found for current user');
    const today = startOfDay(new Date());
    const att = await Attendance.findOne({ employeeId: emp.id, date: today }).exec();
    res.json({ success: true, data: att });
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
    res.json({ success: true, data: records });
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
export const reportQuerySchema = z.object({
    from: z.coerce.date(),
    to: z.coerce.date(),
    departmentId: z.string().optional(),
});
export async function dashboardStats(req, res) {
    const today = startOfDay(new Date());
    const filter = { date: today };
    if (req.query.departmentId) {
        const empIds = await Employee.find({ department: String(req.query.departmentId) }).distinct('_id');
        filter.employeeId = { $in: empIds };
    }
    const totalEmployees = await Employee.countDocuments({ status: 'active' });
    const todayRecords = await Attendance.find(filter).lean().exec();
    const presentCount = todayRecords.filter((r) => r.status === 'present' || r.status === 'late').length;
    const lateCount = todayRecords.filter((r) => r.status === 'late').length;
    const halfDayCount = todayRecords.filter((r) => r.status === 'half_day').length;
    const onLeaveCount = todayRecords.filter((r) => r.status === 'on_leave').length;
    const absentCount = totalEmployees - presentCount - halfDayCount - onLeaveCount;
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