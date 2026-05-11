import { z } from 'zod';
import { IDCardTemplate as IdCardTemplate } from '../models/id-card-template.model.js';
import { Employee } from '../models/employee.model.js';
import { NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
// ---------- Validation Schemas ----------
export const createTemplateSchema = z.object({
    name: z.string().min(1),
    layout: z.enum(['horizontal', 'vertical']).default('horizontal'),
    fields: z.array(z.string()).default(['name', 'designation', 'department', 'employeeId', 'photo']),
    backgroundColor: z.string().default('#ffffff'),
    textColor: z.string().default('#000000'),
    logo: z.string().optional(),
    template: z.record(z.string(), z.unknown()).optional(),
});
export const updateTemplateSchema = createTemplateSchema.partial();
// ---------- Controllers ----------
export async function listTemplates(_req, res) {
    const templates = await IdCardTemplate.find({ deletedAt: null }).sort({ createdAt: -1 }).lean().exec();
    res.json({ success: true, data: templates });
}
export async function createTemplate(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userId = req.user._id;
    const body = req.body;
    const template = await IdCardTemplate.create({ ...body, createdBy: userId });
    void audit({ action: 'create', entity: 'IdCardTemplate', entityId: String(template._id) });
    res.status(201).json({ success: true, data: template });
}
export async function updateTemplate(req, res) {
    const body = req.body;
    const template = await IdCardTemplate.findByIdAndUpdate(String(req.params.id), body, { new: true }).exec();
    if (!template)
        throw new NotFoundError('Template not found');
    void audit({ action: 'update', entity: 'IdCardTemplate', entityId: String(template._id) });
    res.json({ success: true, data: template });
}
export async function generateIdCard(req, res) {
    const employeeId = String(req.params.employeeId);
    const employee = await Employee.findById(employeeId)
        .populate('departmentId', 'name')
        .populate('designationId', 'title')
        .lean()
        .exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    // Return employee data formatted for ID card generation
    res.json({
        success: true,
        data: {
            employee,
            generatedAt: new Date().toISOString(),
        },
    });
}
//# sourceMappingURL=id-card.controller.js.map