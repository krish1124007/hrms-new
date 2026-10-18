import { Types } from 'mongoose';
import { z } from 'zod';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { Employee } from '../models/employee.model.js';
import { AppError, NotFoundError, UnauthorizedError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
import { logger } from '../config/logger.js';
import { formatBusinessDate, notifyEmployeeDecision, notifyOvertimeRequest, reportingManagerUserId, } from '../services/notification.service.js';
import { assertNotSelfApproval, currentEmployeeId } from '../lib/access.js';
import { assertCanDecide, assertOwnOrCanDecide, isApprover, scopeFilter, scopeFilterFor, } from '../lib/approvals.js';
const SELF_APPROVAL_MESSAGE = 'You cannot approve or reject your own overtime request';
const DECIDED_MEANWHILE_MESSAGE = 'This request was decided meanwhile — reload and try again';
/**
 * Tell the employee's reporting manager about a request waiting for them —
 * not when the manager is the one who filed it. Never throws.
 */
async function notifyManagerOfRequest(otReq) {
    try {
        const emp = await Employee.findById(otReq.employee).select('firstName lastName userId reportingManager').lean().exec();
        if (!emp)
            return;
        const managerUserId = await reportingManagerUserId(emp);
        if (!managerUserId || managerUserId === getUserId())
            return;
        await notifyOvertimeRequest(managerUserId, `${emp.firstName} ${emp.lastName}`, otReq.hours, formatBusinessDate(otReq.date), { overtimeId: String(otReq._id) });
    }
    catch (err) {
        logger.warn({ err, overtimeId: String(otReq._id) }, 'overtime: manager notification failed');
    }
}
/** Tell the employee how their request was decided — in-app and by e-mail. Never throws. */
function notifyEmployee(otReq, status, outcome) {
    return notifyEmployeeDecision(otReq.employee, {
        module: 'overtime',
        status,
        title: `Overtime ${status}`,
        message: `Your overtime request for ${otReq.hours} h on ${formatBusinessDate(otReq.date)} ${outcome}`,
        link: '/overtime',
        metadata: { overtimeId: String(otReq._id) },
    });
}
const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectId = z.string().regex(objectIdRegex, 'Invalid id');
export const createSchema = z.object({
    // Optional — defaults to the caller's employee record. Only an approver may
    // file on behalf of someone else, and only for a direct report (HR, with
    // `overtime.approve_all`, for anyone); for everyone else it is ignored.
    employee: objectId.optional(),
    date: z.coerce.date(),
    hours: z.coerce.number().positive().max(24),
    reason: z.string().min(1).max(1000),
});
export const updateSchema = z.object({
    date: z.coerce.date().optional(),
    hours: z.coerce.number().positive().max(24).optional(),
    reason: z.string().min(1).max(1000).optional(),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
    employee: objectId.optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.string().optional(),
});
export const approveSchema = z.object({
    notes: z.string().max(1000).optional(),
});
export const rejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required').max(1000),
});
/** GET /api/v1/overtime */
export async function list(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // HR sees everyone's overtime; a manager their direct reports' and their own.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = await scopeFilterFor(req, 'overtime', q.employee, 'employee');
    if (q.status)
        filter.status = q.status;
    if (q.from || q.to) {
        filter.date = {};
        if (q.from)
            filter.date.$gte = q.from;
        if (q.to)
            filter.date.$lte = q.to;
    }
    const result = await OvertimeRequest.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-date',
        populate: [
            { path: 'employee', select: 'firstName lastName employeeId email profileImage' },
            { path: 'approvedBy', select: 'firstName lastName email' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** GET /api/v1/overtime/me */
export async function listMine(req, res) {
    const employeeId = await currentEmployeeId(req);
    if (!employeeId) {
        res.json({ success: true, data: [], pagination: { page: 1, limit: 0, total: 0, pages: 1 } });
        return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { employee: employeeId };
    if (q.status)
        filter.status = q.status;
    const result = await OvertimeRequest.paginate(filter, {
        page: q.page ?? 1,
        limit: q.limit ?? 50,
        sort: '-date',
        populate: { path: 'approvedBy', select: 'firstName lastName' },
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
/** GET /api/v1/overtime/stats */
export async function stats(req, res) {
    // The same people the list shows: everyone for HR, reports and self for a manager.
    const scope = await scopeFilter(req, 'overtime', 'employee');
    const notDeleted = { isDeleted: { $ne: true }, ...scope };
    const [total, byStatus, hoursAgg] = await Promise.all([
        OvertimeRequest.countDocuments(scope),
        OvertimeRequest.aggregate([
            { $match: notDeleted },
            { $group: { _id: '$status', n: { $sum: 1 } } },
        ]),
        OvertimeRequest.aggregate([
            { $match: { ...notDeleted, status: 'approved' } },
            { $group: { _id: null, totalHours: { $sum: '$hours' } } },
        ]),
    ]);
    const statusCounts = {
        pending: 0,
        approved: 0,
        rejected: 0,
        cancelled: 0,
    };
    for (const r of byStatus)
        statusCounts[r._id] = r.n;
    res.json({
        success: true,
        data: {
            total,
            byStatus: statusCounts,
            approvedHours: hoursAgg[0]?.totalHours ?? 0,
        },
    });
}
/** POST /api/v1/overtime */
export async function create(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    // Resolve which employee the request is for: the caller's own record,
    // unless an approver names someone they could decide for.
    const own = await currentEmployeeId(req);
    let employeeId;
    if (body.employee && isApprover(req, 'overtime') && !own?.equals(body.employee)) {
        await assertCanDecide(req, body.employee, 'overtime');
        const emp = await Employee.findById(body.employee).select('_id').exec();
        if (!emp)
            throw new NotFoundError('Employee not found');
        employeeId = emp._id;
    }
    else {
        if (!own) {
            throw new ValidationAppError('Cannot determine employee — link the user to an employee record');
        }
        employeeId = own;
    }
    const otReq = await OvertimeRequest.create({
        employee: employeeId,
        date: body.date,
        hours: body.hours,
        reason: body.reason,
        status: 'pending',
        appliedAt: new Date(),
    });
    void audit({ action: 'create', entity: 'OvertimeRequest', entityId: String(otReq._id) });
    await notifyManagerOfRequest(otReq);
    res.status(201).json({ success: true, data: otReq });
}
/** GET /api/v1/overtime/:id */
export async function get(req, res) {
    const otReq = await OvertimeRequest.findById(String(req.params.id))
        .populate('employee', 'firstName lastName employeeId email profileImage')
        .populate('approvedBy', 'firstName lastName email')
        .exec();
    if (!otReq)
        throw new NotFoundError('Overtime request not found');
    await assertOwnOrCanDecide(req, otReq.employee, 'overtime');
    res.json({ success: true, data: otReq });
}
/** PATCH /api/v1/overtime/:id */
export async function update(req, res) {
    const body = req.body;
    const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
    if (!otReq)
        throw new NotFoundError('Overtime request not found');
    await assertOwnOrCanDecide(req, otReq.employee, 'overtime');
    if (otReq.status !== 'pending') {
        throw new ValidationAppError('Only pending requests can be edited');
    }
    if (body.date !== undefined)
        otReq.date = body.date;
    if (body.hours !== undefined)
        otReq.hours = body.hours;
    if (body.reason !== undefined)
        otReq.reason = body.reason;
    await otReq.save();
    void audit({ action: 'update', entity: 'OvertimeRequest', entityId: String(otReq._id) });
    res.json({ success: true, data: otReq });
}
/**
 * DELETE /api/v1/overtime/:id — withdraw a request while it is still pending.
 * Decided requests stay: payroll pays approved overtime, and a rejection is
 * the record of the decision. The soft delete is conditional on `pending`,
 * so a decision landing meanwhile wins (409 `DECIDED_MEANWHILE`).
 */
export async function remove(req, res) {
    const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
    if (!otReq)
        throw new NotFoundError('Overtime request not found');
    await assertOwnOrCanDecide(req, otReq.employee, 'overtime');
    if (otReq.status !== 'pending') {
        throw new ValidationAppError(`Only pending requests can be withdrawn (this one is ${otReq.status})`);
    }
    const userId = getUserId();
    const withdrawn = await OvertimeRequest.findOneAndUpdate({ _id: otReq._id, status: 'pending' }, {
        $set: {
            isDeleted: true,
            deletedAt: new Date(),
            ...(userId ? { deletedBy: new Types.ObjectId(userId) } : {}),
        },
    }).exec();
    if (!withdrawn)
        throw new AppError(DECIDED_MEANWHILE_MESSAGE, 409, 'DECIDED_MEANWHILE');
    void audit({ action: 'delete', entity: 'OvertimeRequest', entityId: String(otReq._id) });
    res.json({ success: true, message: 'Overtime request withdrawn' });
}
/**
 * Record a decision on a still-pending request — one conditional write, so of
 * two deciders racing only one lands; the other gets 409 `DECIDED_MEANWHILE`
 * and the employee is told once.
 */
async function decidePending(id, set) {
    const decided = await OvertimeRequest.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: set }, { new: true, runValidators: true }).exec();
    if (!decided)
        throw new AppError(DECIDED_MEANWHILE_MESSAGE, 409, 'DECIDED_MEANWHILE');
    return decided;
}
/** POST /api/v1/overtime/:id/approve */
export async function approve(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
    if (!otReq)
        throw new NotFoundError('Overtime request not found');
    await assertNotSelfApproval(req, otReq.employee, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, otReq.employee, 'overtime');
    if (otReq.status !== 'pending') {
        throw new ValidationAppError(`Cannot approve a request with status "${otReq.status}"`);
    }
    const decided = await decidePending(otReq._id, {
        status: 'approved',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        ...(body.notes ? { approverNotes: body.notes } : {}),
    });
    void audit({
        action: 'update',
        entity: 'OvertimeRequest',
        entityId: String(decided._id),
        metadata: { event: 'approved' },
    });
    await notifyEmployee(decided, 'approved', 'was approved.');
    res.json({ success: true, data: decided });
}
/** POST /api/v1/overtime/:id/reject */
export async function reject(req, res) {
    if (!req.user)
        throw new UnauthorizedError();
    const body = req.body;
    const otReq = await OvertimeRequest.findById(String(req.params.id)).exec();
    if (!otReq)
        throw new NotFoundError('Overtime request not found');
    await assertNotSelfApproval(req, otReq.employee, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, otReq.employee, 'overtime');
    if (otReq.status !== 'pending') {
        throw new ValidationAppError(`Cannot reject a request with status "${otReq.status}"`);
    }
    const decided = await decidePending(otReq._id, {
        status: 'rejected',
        approvedBy: req.user._id,
        approvedAt: new Date(),
        rejectedReason: body.reason,
    });
    void audit({
        action: 'update',
        entity: 'OvertimeRequest',
        entityId: String(decided._id),
        metadata: { event: 'rejected', reason: body.reason },
    });
    await notifyEmployee(decided, 'rejected', `was rejected. Reason: ${body.reason}`);
    res.json({ success: true, data: decided });
}
//# sourceMappingURL=overtime.controller.js.map