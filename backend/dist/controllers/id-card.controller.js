import { z } from 'zod';
import QRCode from 'qrcode';
import { IDCardTemplate as IdCardTemplate } from '../models/id-card-template.model.js';
import { Employee } from '../models/employee.model.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
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
/** Joining + 5 years — the rule the web and mobile cards already use. */
function validUntilFor(joiningDate) {
    if (!joiningDate)
        return null;
    const d = new Date(joiningDate);
    d.setFullYear(d.getFullYear() + 5);
    return d;
}
/**
 * Build the card DTO for one employee.
 *
 * The QR encodes the employee code only — enough for your own gate scanners
 * to identify the holder, and it carries nothing sensitive if photographed.
 * It is deliberately NOT a proof of authenticity; that needs a signed token
 * plus a public verify endpoint, which is a separate decision.
 */
async function buildCard(employee) {
    const qr = await QRCode.toDataURL(`DDIPL:${employee.employeeId}`, {
        margin: 1,
        width: 256,
        errorCorrectionLevel: 'M',
    });
    return {
        employeeId: employee.employeeId,
        firstName: employee.firstName,
        lastName: employee.lastName,
        designation: employee.designation?.name ?? null,
        department: employee.department?.name ?? null,
        profileImage: employee.profileImage ?? null,
        bloodGroup: employee.bloodGroup ?? null,
        joiningDate: employee.joiningDate ?? null,
        validUntil: validUntilFor(employee.joiningDate),
        qr,
    };
}
/**
 * GET /api/v1/id-cards/my — the caller's own card.
 *
 * There is no id parameter by design: the employee is resolved from the
 * authenticated user, so this route cannot return anybody else's card no
 * matter what the client sends.
 */
export async function myIdCard(_req, res) {
    const userId = getUserId();
    if (!userId)
        throw new ForbiddenError('Not authenticated');
    const employee = await Employee.findOne({ userId })
        .populate('department', 'name')
        .populate('designation', 'name')
        .lean()
        .exec();
    if (!employee)
        throw new NotFoundError('No employee profile found for your account');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.json({ success: true, data: await buildCard(employee) });
}
/**
 * GET /api/v1/id-cards/generate/:employeeId — any employee's card, for HR.
 *
 * Previously this populated `departmentId`/`designationId`, which are not
 * fields on the Employee schema — Mongoose 8 rejects unknown populate paths,
 * so the route always failed. It also had no permission guard at all.
 */
export async function generateIdCard(req, res) {
    const employeeId = String(req.params.employeeId);
    const employee = await Employee.findById(employeeId)
        .populate('department', 'name')
        .populate('designation', 'name')
        .lean()
        .exec();
    if (!employee)
        throw new NotFoundError('Employee not found');
    res.json({
        success: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        data: { employee: await buildCard(employee), generatedAt: new Date().toISOString() },
    });
}
//# sourceMappingURL=id-card.controller.js.map