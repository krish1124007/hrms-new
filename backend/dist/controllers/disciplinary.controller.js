import { z } from 'zod';
import { DisciplinaryAction } from '../models/disciplinary-action.model.js';
import { Employee } from '../models/employee.model.js';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationAppError, } from '../lib/errors.js';
import { getUserId } from '../lib/async-context.js';
import { audit } from '../services/audit.service.js';
// Permission helper — true when the caller has the manager-level permissions
// (admin/HR/manager). Non-privileged employees can still read their own case
// detail via the ownership check in `get()`.
function hasDisciplinaryView(req) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const role = req.user?.role;
    const perms = new Set([
        ...(role?.permissions ?? []),
        ...(req.user?.customPermissions ?? []),
    ]);
    return perms.has('*') || perms.has('disciplinary.view');
}
/** GET /api/v1/disciplinary/me — actions against the calling employee. Auth-only. */
export async function myActions(_req, res) {
    const userId = getUserId();
    if (!userId) {
        res.json({ success: true, data: [] });
        return;
    }
    const emp = await Employee.findOne({ userId }).select('_id').lean().exec();
    if (!emp) {
        res.json({ success: true, data: [] });
        return;
    }
    const actions = await DisciplinaryAction.find({ employee: emp._id })
        .sort({ createdAt: -1 })
        .lean()
        .exec();
    res.json({ success: true, data: actions });
}
const TYPES = [
    'verbal_warning',
    'written_warning',
    'final_warning',
    'pip',
    'suspension',
    'termination',
    'other',
];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = [
    'open',
    'acknowledged',
    'in_progress',
    'escalated',
    'resolved',
    'failed',
    'cancelled',
];
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');
export const createSchema = z.object({
    employee: objectId,
    type: z.enum(TYPES),
    severity: z.enum(SEVERITIES).default('medium'),
    title: z.string().min(1).max(200),
    description: z.string().min(1).max(5000),
    incidentDate: z.coerce.date().optional(),
    pipStartDate: z.coerce.date().optional(),
    pipEndDate: z.coerce.date().optional(),
    pipGoals: z.string().optional(),
    confidential: z.boolean().default(true),
});
export const updateSchema = createSchema.partial();
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().optional(),
    status: z.enum(STATUSES).optional(),
    type: z.enum(TYPES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    employee: objectId.optional(),
    sort: z.string().optional(),
});
export const acknowledgeSchema = z.object({
    notes: z.string().optional(),
});
export const resolveSchema = z.object({
    outcome: z.enum(['resolved', 'failed']),
    notes: z.string().min(1, 'A resolution note is required'),
});
export const escalateSchema = z.object({
    escalatedTo: objectId,
    reason: z.string().min(1, 'Escalation reason is required'),
});
export const cancelSchema = z.object({
    reason: z.string().optional(),
});
export const addCommentSchema = z.object({
    text: z.string().min(1).max(5000),
});
export const addAttachmentSchema = z.object({
    name: z.string().min(1).max(200),
    url: z.string().url(),
});
async function nextCaseNumber() {
    // Include soft-deleted rows so we don't reuse a code from the trash. Same
    // pattern used by `nextPolicyCode`. Without this, a soft-deleted DA-00001
    // collides with the freshly-generated one because the unique index covers
    // deleted rows too.
    const last = await DisciplinaryAction.findOne({ caseNumber: /^DA-/ })
        .setOptions({ withDeleted: true })
        .sort({ caseNumber: -1 })
        .select('caseNumber')
        .lean()
        .exec();
    const lastNum = last?.caseNumber?.match(/DA-(\d+)/)?.[1];
    const next = lastNum ? Number(lastNum) + 1 : 1;
    return `DA-${String(next).padStart(5, '0')}`;
}
/** GET /api/v1/disciplinary */
export async function list(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.status)
        filter.status = q.status;
    if (q.type)
        filter.type = q.type;
    if (q.severity)
        filter.severity = q.severity;
    if (q.employee)
        filter.employee = q.employee;
    if (q.search) {
        const re = new RegExp(q.search, 'i');
        filter.$or = [{ caseNumber: re }, { title: re }];
    }
    const result = await DisciplinaryAction.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'employee', select: 'firstName lastName employeeId email profileImage' },
            { path: 'issuedBy', select: 'firstName lastName email' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** GET /api/v1/disciplinary/stats */
export async function stats(_req, res) {
    const notDeleted = { isDeleted: { $ne: true } };
    const [total, byStatus, byType, bySeverity] = await Promise.all([
        DisciplinaryAction.countDocuments({}),
        DisciplinaryAction.aggregate([
            { $match: notDeleted },
            { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        DisciplinaryAction.aggregate([
            { $match: notDeleted },
            { $group: { _id: '$type', n: { $sum: 1 } } },
        ]),
        DisciplinaryAction.aggregate([
            { $match: notDeleted },
            { $group: { _id: '$severity', n: { $sum: 1 } } },
        ]),
    ]);
    const statusCounts = {};
    for (const s of STATUSES)
        statusCounts[s] = 0;
    for (const r of byStatus)
        statusCounts[r._id] = r.n;
    const severityCounts = {};
    for (const s of SEVERITIES)
        severityCounts[s] = 0;
    for (const r of bySeverity)
        severityCounts[r._id] = r.n;
    res.json({
        success: true,
        data: { total, byStatus: statusCounts, byType, bySeverity: severityCounts },
    });
}
/** POST /api/v1/disciplinary */
export async function create(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const caseNumber = await nextCaseNumber();
    try {
        const action = await DisciplinaryAction.create({
            ...body,
            caseNumber,
            issuedBy: req.user._id,
        });
        void audit({ action: 'create', entity: 'DisciplinaryAction', entityId: String(action._id) });
        res.status(201).json({ success: true, data: action });
    }
    catch (err) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (err.code === 11000) {
            throw new ConflictError('Case number collision — please retry');
        }
        throw err;
    }
}
/** GET /api/v1/disciplinary/:id */
export async function get(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const action = await DisciplinaryAction.findById(String(req.params.id))
        .populate('employee', 'firstName lastName employeeId email profileImage userId')
        .populate('issuedBy', 'firstName lastName email')
        .populate('escalatedTo', 'firstName lastName email')
        .populate('comments.author', 'firstName lastName')
        .exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    // Ownership escape hatch — non-managers can view their OWN case (the
    // employee the action is filed against) even without `disciplinary.view`.
    if (!hasDisciplinaryView(req)) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const emp = action.employee;
        const ownerUserId = emp?.userId ? String(emp.userId) : null;
        if (!ownerUserId || ownerUserId !== String(req.user._id)) {
            throw new ForbiddenError('You can only view your own disciplinary record');
        }
    }
    res.json({ success: true, data: action });
}
/** PATCH /api/v1/disciplinary/:id */
export async function update(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    if (action.status === 'resolved' || action.status === 'failed' || action.status === 'cancelled') {
        throw new ValidationAppError(`Cannot edit a closed case (status: ${action.status})`);
    }
    Object.assign(action, body);
    await action.save();
    void audit({ action: 'update', entity: 'DisciplinaryAction', entityId: String(action._id) });
    res.json({ success: true, data: action });
}
/** DELETE /api/v1/disciplinary/:id */
export async function remove(req, res) {
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await action.softDelete();
    void audit({ action: 'delete', entity: 'DisciplinaryAction', entityId: String(action._id) });
    res.json({ success: true, message: 'Case deleted' });
}
/** POST /api/v1/disciplinary/:id/acknowledge */
export async function acknowledge(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    if (action.status !== 'open') {
        throw new ValidationAppError(`Only open cases can be acknowledged (status: ${action.status})`);
    }
    action.status = action.type === 'pip' ? 'in_progress' : 'acknowledged';
    action.acknowledgedAt = new Date();
    if (body.notes)
        action.acknowledgementNotes = body.notes;
    await action.save();
    void audit({
        action: 'update',
        entity: 'DisciplinaryAction',
        entityId: String(action._id),
        metadata: { event: 'acknowledged' },
    });
    res.json({ success: true, data: action });
}
/** POST /api/v1/disciplinary/:id/resolve */
export async function resolve(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    if (action.status === 'resolved' || action.status === 'failed' || action.status === 'cancelled') {
        throw new ValidationAppError('Case is already closed');
    }
    action.status = body.outcome;
    action.resolutionDate = new Date();
    action.resolutionNotes = body.notes;
    await action.save();
    void audit({
        action: 'update',
        entity: 'DisciplinaryAction',
        entityId: String(action._id),
        metadata: { event: 'resolved', outcome: body.outcome },
    });
    res.json({ success: true, data: action });
}
/** POST /api/v1/disciplinary/:id/escalate */
export async function escalate(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    if (action.status === 'resolved' || action.status === 'failed' || action.status === 'cancelled') {
        throw new ValidationAppError('Cannot escalate a closed case');
    }
    action.status = 'escalated';
    action.escalatedAt = new Date();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    action.escalatedTo = body.escalatedTo;
    action.escalationReason = body.reason;
    await action.save();
    void audit({
        action: 'update',
        entity: 'DisciplinaryAction',
        entityId: String(action._id),
        metadata: { event: 'escalated', to: body.escalatedTo },
    });
    res.json({ success: true, data: action });
}
/** POST /api/v1/disciplinary/:id/cancel */
export async function cancel(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    if (action.status === 'resolved' || action.status === 'failed' || action.status === 'cancelled') {
        throw new ValidationAppError('Case is already closed');
    }
    action.status = 'cancelled';
    action.resolutionDate = new Date();
    if (body.reason)
        action.resolutionNotes = body.reason;
    await action.save();
    void audit({
        action: 'update',
        entity: 'DisciplinaryAction',
        entityId: String(action._id),
        metadata: { event: 'cancelled' },
    });
    res.json({ success: true, data: action });
}
/** POST /api/v1/disciplinary/:id/comments */
export async function addComment(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    action.comments.push({
        author: req.user._id,
        text: body.text,
        createdAt: new Date(),
    });
    await action.save();
    await action.populate('comments.author', 'firstName lastName');
    res.status(201).json({ success: true, data: action });
}
/** POST /api/v1/disciplinary/:id/attachments */
export async function addAttachment(req, res) {
    const body = req.body;
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    action.attachments.push({
        name: body.name,
        url: body.url,
        uploadedAt: new Date(),
    });
    await action.save();
    res.status(201).json({ success: true, data: action });
}
/** DELETE /api/v1/disciplinary/:id/attachments/:attId */
export async function removeAttachment(req, res) {
    const action = await DisciplinaryAction.findById(String(req.params.id)).exec();
    if (!action)
        throw new NotFoundError('Disciplinary action not found');
    const before = action.attachments.length;
    action.attachments = action.attachments.filter(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (a) => String(a._id) !== String(req.params.attId));
    if (action.attachments.length === before) {
        throw new NotFoundError('Attachment not found');
    }
    await action.save();
    res.json({ success: true, data: action });
}
//# sourceMappingURL=disciplinary.controller.js.map