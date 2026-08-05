import { z } from 'zod';
import QRCode from 'qrcode';
import { IDCardTemplate as IdCardTemplate } from '../models/id-card-template.model.js';
import { Employee } from '../models/employee.model.js';
import { ForbiddenError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { signEmployeeCode, verifyEmployeeCode } from '../lib/id-card-token.js';
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
 * Where the QR points. Prefer an explicit public URL; otherwise derive it
 * from the request, which is correct here because the SPA and the API are
 * served from the same host (`trust proxy` is on, so the scheme survives
 * nginx).
 */
function publicBaseUrl(req) {
    const configured = process.env.PUBLIC_APP_URL?.replace(/\/+$/, '');
    if (configured)
        return configured;
    return `${req.protocol}://${req.get('host') ?? ''}`;
}
/**
 * Build the card DTO for one employee.
 *
 * The QR holds a link to the public verify page carrying a signed code. A
 * phone camera opens it directly, and the code cannot be forged for another
 * employee. Nothing personal is encoded in the QR itself.
 */
async function buildCard(employee, req) {
    const verifyUrl = `${publicBaseUrl(req)}/verify/${signEmployeeCode(String(employee._id))}`;
    const qr = await QRCode.toDataURL(verifyUrl, {
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
        verifyUrl,
    };
}
/**
 * GET /api/v1/id-cards/verify/:code — PUBLIC. This is what a QR scan lands on.
 *
 * Deliberately minimal: enough for a guard or visitor to confirm the person in
 * front of them holds a genuine, currently-active card, and nothing more. No
 * email, phone, address, salary or bank details — a scan is not a login.
 */
export async function verifyIdCard(req, res) {
    const employeeId = verifyEmployeeCode(String(req.params.code));
    if (!employeeId) {
        res.status(404).json({
            success: false,
            error: { code: 'INVALID_CARD', message: 'This code is not a valid ID card' },
        });
        return;
    }
    const employee = await Employee.findById(employeeId)
        .select('firstName lastName employeeId profileImage status joiningDate department designation')
        .populate('department', 'name')
        .populate('designation', 'name')
        .lean()
        .exec();
    if (!employee) {
        res.status(404).json({
            success: false,
            error: { code: 'INVALID_CARD', message: 'This code is not a valid ID card' },
        });
        return;
    }
    // Only a current employee verifies. Anyone who has left keeps a card that
    // scans, so the answer has to be "no longer employed", not a blank page.
    const active = employee.status === 'active';
    res.json({
        success: true,
        data: {
            valid: active,
            status: active ? 'active' : 'inactive',
            employeeId: employee.employeeId,
            firstName: employee.firstName,
            lastName: employee.lastName,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            designation: employee.designation?.name ?? null,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            department: employee.department?.name ?? null,
            profileImage: employee.profileImage ?? null,
            joiningDate: employee.joiningDate ?? null,
        },
    });
}
/**
 * GET /api/v1/id-cards/my — the caller's own card.
 *
 * There is no id parameter by design: the employee is resolved from the
 * authenticated user, so this route cannot return anybody else's card no
 * matter what the client sends.
 */
export async function myIdCard(req, res) {
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
    res.json({ success: true, data: await buildCard(employee, req) });
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
        data: { employee: await buildCard(employee, req), generatedAt: new Date().toISOString() },
    });
}
//# sourceMappingURL=id-card.controller.js.map