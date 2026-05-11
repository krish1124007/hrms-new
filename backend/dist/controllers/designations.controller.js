import { z } from 'zod';
import { Designation } from '../models/designation.model.js';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
export const createDesignationSchema = z.object({
    name: z.string().min(1),
    department: z.string().optional(),
    level: z.coerce.number().int().min(1).default(1),
    description: z.string().optional(),
});
export const updateDesignationSchema = createDesignationSchema.partial();
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(50),
    search: z.string().optional(),
    department: z.string().optional(),
    sort: z.string().optional(),
});
export async function listDesignations(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.department)
        filter.department = q.department;
    if (q.search)
        filter.name = { $regex: q.search, $options: 'i' };
    const result = await Designation.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? 'level',
        populate: { path: 'department', select: 'name code' },
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createDesignation(req, res) {
    const body = req.body;
    const dup = await Designation.findOne({
        name: body.name,
        department: body.department ?? null,
    }).exec();
    if (dup)
        throw new ConflictError('Designation already exists in department');
    const d = await Designation.create(body);
    void audit({ action: 'create', entity: 'Designation', entityId: String(d._id) });
    res.status(201).json({ success: true, data: d });
}
export async function getDesignation(req, res) {
    const d = await Designation.findById(String(req.params.id))
        .populate('department', 'name code')
        .exec();
    if (!d)
        throw new NotFoundError('Designation not found');
    res.json({ success: true, data: d });
}
export async function updateDesignation(req, res) {
    const body = req.body;
    const d = await Designation.findByIdAndUpdate(String(req.params.id), body, {
        new: true,
    }).exec();
    if (!d)
        throw new NotFoundError('Designation not found');
    void audit({
        action: 'update',
        entity: 'Designation',
        entityId: String(d._id),
        after: body,
    });
    res.json({ success: true, data: d });
}
export async function deleteDesignation(req, res) {
    const d = await Designation.findById(String(req.params.id)).exec();
    if (!d)
        throw new NotFoundError('Designation not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await d.softDelete();
    void audit({ action: 'delete', entity: 'Designation', entityId: String(d._id) });
    res.json({ success: true, message: 'Designation deleted' });
}
//# sourceMappingURL=designations.controller.js.map