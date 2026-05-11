import { z } from 'zod';
import { Location } from '../models/location.model.js';
import { NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
// ---------- Validation Schemas ----------
export const createLocationSchema = z.object({
    name: z.string().min(1),
    type: z.enum(['office', 'branch', 'warehouse', 'site']).default('office'),
    address: z.string().min(1),
    coordinates: z
        .object({ lat: z.number(), lng: z.number() })
        .optional(),
    phone: z.string().optional(),
    manager: z.string().optional(),
    employees: z.array(z.string()).default([]),
    isActive: z.boolean().default(true),
});
export const updateLocationSchema = createLocationSchema.partial();
export const assignEmployeesSchema = z.object({
    employeeIds: z.array(z.string().min(1)).min(1),
});
// ---------- Controllers ----------
export async function listLocations(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const page = Number(q.page ?? 1);
    const limit = Number(q.limit ?? 20);
    const skip = (page - 1) * limit;
    const filter = { deletedAt: null };
    if (q.search) {
        filter.$or = [
            { name: { $regex: q.search, $options: 'i' } },
            { address: { $regex: q.search, $options: 'i' } },
        ];
    }
    if (q.type)
        filter.type = q.type;
    const [locations, total] = await Promise.all([
        Location.find(filter)
            .populate('manager', 'firstName lastName email')
            .sort({ name: 1 })
            .skip(skip)
            .limit(limit)
            .lean()
            .exec(),
        Location.countDocuments(filter).exec(),
    ]);
    res.json({
        success: true,
        data: locations,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
}
export async function createLocation(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = req.user._id;
    const body = req.body;
    const location = await Location.create({ ...body, createdBy: userId });
    void audit({ action: 'create', entity: 'Location', entityId: String(location._id) });
    res.status(201).json({ success: true, data: location });
}
export async function getLocation(req, res) {
    const location = await Location.findById(String(req.params.id)).exec();
    if (!location || location.deletedAt)
        throw new NotFoundError('Location not found');
    res.json({ success: true, data: location });
}
export async function updateLocation(req, res) {
    const body = req.body;
    const location = await Location.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!location)
        throw new NotFoundError('Location not found');
    void audit({ action: 'update', entity: 'Location', entityId: String(location._id) });
    res.json({ success: true, data: location });
}
export async function deleteLocation(req, res) {
    const location = await Location.findById(String(req.params.id)).exec();
    if (!location)
        throw new NotFoundError('Location not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await location.softDelete();
    void audit({ action: 'delete', entity: 'Location', entityId: String(location._id) });
    res.json({ success: true, message: 'Location deleted' });
}
export async function assignEmployees(req, res) {
    const body = req.body;
    const location = await Location.findById(String(req.params.id)).exec();
    if (!location)
        throw new NotFoundError('Location not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    location.employees = body.employeeIds;
    await location.save();
    void audit({ action: 'update', entity: 'Location', entityId: String(location._id), after: { employees: body.employeeIds } });
    res.json({ success: true, data: location, message: 'Employees assigned to location' });
}
//# sourceMappingURL=location.controller.js.map