import { z } from 'zod';
import { LocationTrack } from '../models/location-track.model.js';
import { Employee } from '../models/employee.model.js';
import { ValidationAppError } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { getFieldTrackingNamespace } from '../sockets/field-tracking.socket.js';
const pointSchema = z.object({
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
});
export const batchSchema = z.object({
    points: z.array(pointSchema).min(1).max(500),
});
export const historyQuerySchema = z.object({
    date: z.coerce.date().optional(),
});
async function resolveEmployeeId() {
    const userId = getUserId();
    if (!userId)
        return null;
    const emp = await Employee.findOne({ userId }).select('_id').exec();
    return emp ? String(emp._id) : null;
}
export async function ingestBatch(req, res) {
    const body = req.body;
    const empId = await resolveEmployeeId();
    if (!empId)
        throw new ValidationAppError('Employee profile not found');
    const docs = body.points.map((p) => ({
        employeeId: empId,
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
    // Broadcast latest point to admin room
    const tenantId = undefined;
    const ns = getFieldTrackingNamespace();
    if (ns && tenantId) {
        const latest = body.points[body.points.length - 1];
        ns.to(`tenant:${String(tenantId)}`).emit('location:update', {
            employeeId: empId,
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
export async function liveTracking(_req, res) {
    // Return last known position per employee (today)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const docs = await LocationTrack.aggregate([
        { $match: { timestamp: { $gte: start } } },
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
    // Populate employee names
    const empIds = docs.map((d) => d._id);
    const employees = await Employee.find({ _id: { $in: empIds } })
        .select('firstName lastName employeeCode avatar')
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
export async function trackingHistory(req, res) {
    const employeeId = String(req.params.employeeId);
    const date = req.query.date ? new Date(String(req.query.date)) : new Date();
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    const docs = await LocationTrack.find({
        employeeId,
        timestamp: { $gte: start, $lte: end },
    })
        .sort({ timestamp: 1 })
        .lean()
        .exec();
    const trail = docs.map((d) => ({
        timestamp: d.timestamp,
        lng: d.location.coordinates[0],
        lat: d.location.coordinates[1],
        speed: d.speed,
        activity: d.activity,
        battery: d.battery,
    }));
    res.json({ success: true, data: trail });
}
//# sourceMappingURL=field-tracking.controller.js.map