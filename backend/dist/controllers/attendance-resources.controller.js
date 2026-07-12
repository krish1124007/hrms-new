import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { AttendanceSite } from '../models/attendance-site.model.js';
import { GeofenceZone } from '../models/geofence-zone.model.js';
import { QRCode } from '../models/qr-code.model.js';
import { AllowedIP } from '../models/allowed-ip.model.js';
import { NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
// ============================================================================
// SITES
// ============================================================================
export const createSiteSchema = z.object({
    name: z.string().min(1),
    address: z.string().optional(),
    location: z.object({ lat: z.number(), lng: z.number() }),
    radius: z.number().min(1).default(100),
    assignedEmployees: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
});
export const updateSiteSchema = createSiteSchema.partial();
export const listSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    search: z.string().optional(),
});
export async function listSites(req, res) {
    const q = req.query;
    const filter = {};
    if (q.search)
        filter.name = { $regex: q.search, $options: 'i' };
    const result = await AttendanceSite.paginate(filter, { page: q.page, limit: q.limit, sort: 'name' });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createSite(req, res) {
    const body = req.body;
    const site = await AttendanceSite.create(body);
    void audit({ action: 'create', entity: 'AttendanceSite', entityId: String(site._id) });
    res.status(201).json({ success: true, data: site });
}
export async function getSite(req, res) {
    const site = await AttendanceSite.findById(String(req.params.id))
        .populate('assignedEmployees', 'firstName lastName employeeId')
        .exec();
    if (!site)
        throw new NotFoundError('Site not found');
    res.json({ success: true, data: site });
}
export async function updateSite(req, res) {
    const body = req.body;
    const site = await AttendanceSite.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!site)
        throw new NotFoundError('Site not found');
    void audit({ action: 'update', entity: 'AttendanceSite', entityId: String(site._id), after: body });
    res.json({ success: true, data: site });
}
export async function deleteSite(req, res) {
    const site = await AttendanceSite.findById(String(req.params.id)).exec();
    if (!site)
        throw new NotFoundError('Site not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await site.softDelete();
    void audit({ action: 'delete', entity: 'AttendanceSite', entityId: String(site._id) });
    res.json({ success: true, message: 'Site deleted' });
}
export const assignEmployeesSchema = z.object({
    employeeIds: z.array(z.string()).min(1),
});
export async function assignEmployees(req, res) {
    const { employeeIds } = req.body;
    const site = await AttendanceSite.findByIdAndUpdate(String(req.params.id), { $addToSet: { assignedEmployees: { $each: employeeIds } } }, { new: true }).exec();
    if (!site)
        throw new NotFoundError('Site not found');
    res.json({ success: true, data: site });
}
// ============================================================================
// GEOFENCE ZONES
// ============================================================================
const centerSchema = z.object({ lat: z.number(), lng: z.number() });
export const createGeofenceSchema = z
    .object({
    name: z.string().min(1),
    type: z.enum(['circle', 'polygon']),
    center: centerSchema.optional(),
    radius: z.number().min(1).optional(),
    coordinates: z.array(centerSchema).default([]),
    autoCheckIn: z.boolean().default(false),
    autoCheckOut: z.boolean().default(false),
    isActive: z.boolean().default(true),
})
    .refine((v) => (v.type === 'circle' && v.center && v.radius) ||
    (v.type === 'polygon' && v.coordinates && v.coordinates.length >= 3), { message: 'Circle requires center+radius; polygon requires >=3 coordinates' });
export const updateGeofenceSchema = z.object({
    name: z.string().min(1).optional(),
    type: z.enum(['circle', 'polygon']).optional(),
    center: centerSchema.optional(),
    radius: z.number().min(1).optional(),
    coordinates: z.array(centerSchema).optional(),
    autoCheckIn: z.boolean().optional(),
    autoCheckOut: z.boolean().optional(),
    isActive: z.boolean().optional(),
});
export async function listGeofences(req, res) {
    const q = req.query;
    const filter = {};
    if (q.search)
        filter.name = { $regex: q.search, $options: 'i' };
    const result = await GeofenceZone.paginate(filter, { page: q.page, limit: q.limit, sort: 'name' });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createGeofence(req, res) {
    const body = req.body;
    const zone = await GeofenceZone.create(body);
    void audit({ action: 'create', entity: 'GeofenceZone', entityId: String(zone._id) });
    res.status(201).json({ success: true, data: zone });
}
export async function getGeofence(req, res) {
    const zone = await GeofenceZone.findById(String(req.params.id)).exec();
    if (!zone)
        throw new NotFoundError('Geofence not found');
    res.json({ success: true, data: zone });
}
export async function updateGeofence(req, res) {
    const body = req.body;
    const zone = await GeofenceZone.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!zone)
        throw new NotFoundError('Geofence not found');
    void audit({ action: 'update', entity: 'GeofenceZone', entityId: String(zone._id), after: body });
    res.json({ success: true, data: zone });
}
export async function deleteGeofence(req, res) {
    const zone = await GeofenceZone.findById(String(req.params.id)).exec();
    if (!zone)
        throw new NotFoundError('Geofence not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await zone.softDelete();
    void audit({ action: 'delete', entity: 'GeofenceZone', entityId: String(zone._id) });
    res.json({ success: true, message: 'Geofence deleted' });
}
// ============================================================================
// QR CODES
// ============================================================================
export const createQRSchema = z.object({
    type: z.enum(['static', 'dynamic']).default('static'),
    locationId: z.string().optional(),
    expiresAt: z.coerce.date().optional(),
});
export async function listQRCodes(req, res) {
    const q = req.query;
    // Only static codes are managed here. Dynamic codes are ephemeral (rotated
    // every ~45s) and shown live on the display screen, so they never belong in
    // this list.
    const result = await QRCode.paginate({ type: 'static' }, { page: q.page, limit: q.limit, sort: '-createdAt' });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createQRCode(req, res) {
    const body = req.body;
    const code = randomBytes(16).toString('hex');
    const qr = await QRCode.create({
        code,
        type: body.type,
        locationId: body.locationId,
        expiresAt: body.expiresAt,
        isActive: true,
    });
    void audit({ action: 'create', entity: 'QRCode', entityId: String(qr._id) });
    res.status(201).json({ success: true, data: qr });
}
export async function rotateDynamicQR(_req, res) {
    // Keep only the latest dynamic code valid: drop previous ones so a stale or
    // photographed code can't be reused after the display refreshes. (The TTL
    // index also sweeps expired codes, but this makes rotation immediate.)
    await QRCode.deleteMany({ type: 'dynamic' }).exec();
    // Generate a new short-lived dynamic QR (45s window)
    const code = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 45_000);
    const qr = await QRCode.create({ code, type: 'dynamic', expiresAt, isActive: true });
    res.json({
        success: true,
        data: { code: qr.code, expiresAt: qr.expiresAt, ttlSeconds: 45 },
    });
}
export async function deleteQRCode(req, res) {
    const qr = await QRCode.findByIdAndDelete(String(req.params.id)).exec();
    if (!qr)
        throw new NotFoundError('QR code not found');
    void audit({ action: 'delete', entity: 'QRCode', entityId: String(qr._id) });
    res.json({ success: true, message: 'QR code deleted' });
}
// ============================================================================
// ALLOWED IPs
// ============================================================================
export const createAllowedIPSchema = z
    .object({
    label: z.string().min(1),
    ipAddress: z.string().optional(),
    ipRangeStart: z.string().optional(),
    ipRangeEnd: z.string().optional(),
    locationId: z.string().optional(),
    isActive: z.boolean().default(true),
})
    .refine((v) => v.ipAddress || (v.ipRangeStart && v.ipRangeEnd), {
    message: 'Provide ipAddress or ipRangeStart+ipRangeEnd',
});
export const updateAllowedIPSchema = z.object({
    label: z.string().min(1).optional(),
    ipAddress: z.string().optional(),
    ipRangeStart: z.string().optional(),
    ipRangeEnd: z.string().optional(),
    locationId: z.string().optional(),
    isActive: z.boolean().optional(),
});
export async function listAllowedIPs(req, res) {
    const q = req.query;
    const result = await AllowedIP.paginate({}, { page: q.page, limit: q.limit, sort: 'label' });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createAllowedIP(req, res) {
    const body = req.body;
    const ip = await AllowedIP.create(body);
    void audit({ action: 'create', entity: 'AllowedIP', entityId: String(ip._id) });
    res.status(201).json({ success: true, data: ip });
}
export async function updateAllowedIP(req, res) {
    const body = req.body;
    const ip = await AllowedIP.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!ip)
        throw new NotFoundError('Allowed IP not found');
    void audit({ action: 'update', entity: 'AllowedIP', entityId: String(ip._id), after: body });
    res.json({ success: true, data: ip });
}
export async function deleteAllowedIP(req, res) {
    const ip = await AllowedIP.findById(String(req.params.id)).exec();
    if (!ip)
        throw new NotFoundError('Allowed IP not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await ip.softDelete();
    void audit({ action: 'delete', entity: 'AllowedIP', entityId: String(ip._id) });
    res.json({ success: true, message: 'Allowed IP deleted' });
}
//# sourceMappingURL=attendance-resources.controller.js.map