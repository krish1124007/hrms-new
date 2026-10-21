import { Types } from 'mongoose';
import { z } from 'zod';
import { ExpenseCategory, ExpenseClaim, Employee } from '../models/index.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { cycleHoldingClaim } from '../services/payroll-compute.service.js';
import { cycleLabel } from '../lib/payroll-cycle.js';
import { logger } from '../config/logger.js';
import { formatInr, notifyEmployeeDecision, notifyExpenseRequest, reportingManagerUserId, } from '../services/notification.service.js';
import { getUserId } from '../lib/async-context.js';
import { assertNotSelfApproval, currentEmployeeId } from '../lib/access.js';
import { assertCanDecide, assertOwnOrCanDecide, isApprover, scopeFilter, scopeFilterFor, } from '../lib/approvals.js';
const objectId = z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid id');
/**
 * HR (`expenses.approve_all`) sees and acts on everyone's claims; a manager
 * (`expenses.approve`) on their direct reports' and their own; everyone else
 * only on their own.
 */
const SELF_APPROVAL_MESSAGE = 'You cannot approve or reject your own claim';
const DECIDED_MEANWHILE_MESSAGE = 'This claim was decided meanwhile — reload and try again';
/**
 * Tell the claimant's reporting manager about a claim waiting for them — not
 * when the manager is the one who filed it. Never throws.
 */
async function notifyManagerOfClaim(claim) {
    try {
        const emp = await Employee.findById(claim.employeeId).select('firstName lastName userId reportingManager').lean().exec();
        if (!emp)
            return;
        const managerUserId = await reportingManagerUserId(emp);
        if (!managerUserId || managerUserId === getUserId())
            return;
        await notifyExpenseRequest(managerUserId, `${emp.firstName} ${emp.lastName}`, claim.amount, {
            claimId: String(claim._id),
        });
    }
    catch (err) {
        logger.warn({ err, claimId: String(claim._id) }, 'expense claim: manager notification failed');
    }
}
/** Tell the claimant how their claim was decided — in-app and by e-mail. Never throws. */
function notifyClaimant(claim, status, outcome) {
    return notifyEmployeeDecision(claim.employeeId, {
        module: 'expense',
        status,
        title: `Expense claim ${status}`,
        message: `Your expense claim of ${formatInr(claim.amount)} ${outcome}`,
        link: '/expense-claims',
        metadata: { claimId: String(claim._id) },
    });
}
async function getCurrentEmployee() {
    const userId = getUserId();
    if (!userId)
        return null;
    return Employee.findOne({ userId: new Types.ObjectId(userId) }).exec();
}
// ---------- Expense Category ----------
export const createCategorySchema = z.object({
    name: z.string().min(1),
    code: z.string().min(1),
    description: z.string().optional(),
    limit: z.coerce.number().min(0).optional(),
    requiresReceipt: z.boolean().default(true),
    isActive: z.boolean().default(true),
});
export const updateCategorySchema = createCategorySchema.partial();
export const categoryQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    isActive: z.coerce.boolean().optional(),
});
export async function listCategories(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (typeof q.isActive === 'boolean')
        filter.isActive = q.isActive;
    const result = await ExpenseCategory.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: 'name',
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createCategory(req, res) {
    const body = req.body;
    const doc = await ExpenseCategory.create(body);
    void audit({ action: 'create', entity: 'ExpenseCategory', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function getCategory(req, res) {
    const doc = await ExpenseCategory.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense category not found');
    res.json({ success: true, data: doc });
}
export async function updateCategory(req, res) {
    const doc = await ExpenseCategory.findByIdAndUpdate(String(req.params.id), req.body, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Expense category not found');
    void audit({ action: 'update', entity: 'ExpenseCategory', entityId: String(doc._id) });
    res.json({ success: true, data: doc });
}
export async function deleteCategory(req, res) {
    const doc = await ExpenseCategory.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense category not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    void audit({ action: 'delete', entity: 'ExpenseCategory', entityId: String(doc._id) });
    res.json({ success: true, message: 'Expense category deleted' });
}
// ---------- Expense Claim ----------
export const createClaimSchema = z
    .object({
    employeeId: objectId.optional(),
    category: z.string(),
    amount: z.coerce.number().min(0),
    currency: z.string().default('INR'),
    date: z.coerce.date(),
    description: z.string().optional(),
    receiptUrls: z
        .array(z.object({
        name: z.string(),
        fileUrl: z.string(),
    }))
        .default([]),
    paymentMethod: z.enum(['cash', 'bank', 'card', 'upi', 'cheque', 'other']).optional(),
    status: z.enum(['draft', 'pending']).default('pending'),
})
    // A claim without a bill can't be verified, so it must not reach an
    // approver. Two exemptions: drafts are the employee's own scratch space,
    // and zero-amount entries claim no money at all — they're the "no expense
    // today" marker the check-out flow requires, so there is no bill to attach.
    .superRefine((v, ctx) => {
    if (v.status !== 'draft' && v.amount > 0 && v.receiptUrls.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['receiptUrls'],
            message: 'A receipt or bill photo is required to claim an amount',
        });
    }
});
export const updateClaimSchema = createClaimSchema
    .innerType()
    .partial()
    .omit({ employeeId: true });
export const claimQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'reimbursed']).optional(),
    employeeId: objectId.optional(),
    category: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.string().optional(),
});
export const rejectClaimSchema = z.object({
    reason: z.string().min(1),
});
export const reimburseClaimSchema = z.object({
    reimbursementRef: z.string().optional(),
});
export async function listClaims(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // HR sees every employee's claims; a manager their direct reports' and their own;
    // everyone else only their own. (No employee record matches nothing.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {
        amount: { $gt: 0 },
        ...(await scopeFilterFor(req, 'expenses', q.employeeId)),
    };
    if (q.status)
        filter.status = q.status;
    if (q.category)
        filter.category = new Types.ObjectId(q.category);
    if (q.from || q.to) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const range = {};
        if (q.from)
            range.$gte = q.from;
        if (q.to)
            range.$lte = q.to;
        filter.date = range;
    }
    const result = await ExpenseClaim.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-date',
        populate: [
            { path: 'employeeId', select: 'firstName lastName employeeId' },
            { path: 'category', select: 'name code' },
            { path: 'approvedBy', select: 'firstName lastName email' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myClaims(req, res) {
    const employee = await getCurrentEmployee();
    if (!employee)
        throw new NotFoundError('Employee profile not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const result = await ExpenseClaim.paginate({ employeeId: employee._id }, {
        page: Number(q.page ?? 1),
        limit: Number(q.limit ?? 20),
        sort: '-date',
        populate: [{ path: 'category', select: 'name code' }],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function teamClaims(req, res) {
    const manager = await getCurrentEmployee();
    if (!manager)
        throw new NotFoundError('Employee profile not found');
    const team = await Employee.find({ reportingManager: manager._id }).select('_id').lean().exec();
    const teamIds = team.map((t) => t._id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { employeeId: { $in: teamIds }, amount: { $gt: 0 } };
    if (q.status)
        filter.status = q.status;
    const result = await ExpenseClaim.paginate(filter, {
        page: Number(q.page ?? 1),
        limit: Number(q.limit ?? 20),
        sort: '-date',
        populate: [
            { path: 'employeeId', select: 'firstName lastName employeeId' },
            { path: 'category', select: 'name code' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function createClaim(req, res) {
    const body = req.body;
    // Only an approver may file a claim on someone else's behalf — and only for
    // someone they could decide for (a direct report, or anyone for HR); for
    // anyone else a body `employeeId` is ignored and the claim is theirs.
    const me = await currentEmployeeId(req);
    let employeeId;
    if (body.employeeId && isApprover(req, 'expenses') && !me?.equals(body.employeeId)) {
        await assertCanDecide(req, body.employeeId, 'expenses');
        employeeId = new Types.ObjectId(body.employeeId);
    }
    else {
        if (!me)
            throw new NotFoundError('Employee profile not found');
        employeeId = me;
    }
    // Validate against category limit + receipt requirement
    const cat = await ExpenseCategory.findById(body.category).exec();
    if (!cat)
        throw new NotFoundError('Expense category not found');
    if (cat.limit && body.amount > cat.limit) {
        throw new ValidationAppError(`Amount exceeds category limit of ${cat.limit}`);
    }
    // Category-level receipt rule applies only when money is actually claimed —
    // a zero-amount entry has no bill to produce.
    if (cat.requiresReceipt && body.amount > 0 && body.receiptUrls.length === 0) {
        throw new ValidationAppError('Receipt is required for this category');
    }
    const status = body.amount === 0 ? 'approved' : body.status;
    const doc = await ExpenseClaim.create({
        employeeId,
        category: new Types.ObjectId(body.category),
        amount: body.amount,
        currency: body.currency,
        date: body.date,
        description: body.description,
        receiptUrls: body.receiptUrls.map((r) => ({ ...r, uploadedAt: new Date() })),
        paymentMethod: body.paymentMethod,
        status,
        ...(body.amount === 0 ? { approvedAt: new Date() } : {}),
    });
    void audit({ action: 'create', entity: 'ExpenseClaim', entityId: String(doc._id) });
    // A draft is still the claimant's own; a zero-amount entry needs no approval.
    if (doc.status === 'pending')
        await notifyManagerOfClaim(doc);
    res.status(201).json({ success: true, data: doc });
}
export async function getClaim(req, res) {
    const doc = await ExpenseClaim.findById(String(req.params.id))
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('category', 'name code')
        .populate('approvedBy', 'firstName lastName email')
        .exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertOwnOrCanDecide(req, doc.employeeId, 'expenses');
    res.json({ success: true, data: doc });
}
export async function updateClaim(req, res) {
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertOwnOrCanDecide(req, doc.employeeId, 'expenses');
    if (doc.status !== 'draft' && doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot edit a ${doc.status} claim`);
    }
    const submitting = doc.status === 'draft';
    Object.assign(doc, req.body);
    // Same rule as create: a claim for an amount can only leave draft with a
    // bill attached, so editing can't be used to strip the receipt off a
    // pending claim — or to raise a zero-amount entry into a billed one.
    if (doc.status !== 'draft' && doc.amount > 0 && doc.receiptUrls.length === 0) {
        throw new ValidationAppError('A receipt or bill photo is required to claim an amount');
    }
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id) });
    // A draft the claimant has just submitted is news for their manager, like a new claim.
    if (submitting && doc.status === 'pending' && doc.amount > 0)
        await notifyManagerOfClaim(doc);
    res.json({ success: true, data: doc });
}
export async function deleteClaim(req, res) {
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertOwnOrCanDecide(req, doc.employeeId, 'expenses');
    // Once decided (approved / rejected / reimbursed) a claim is part of the
    // money trail and can no longer be withdrawn.
    if (doc.status !== 'draft' && doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot delete a ${doc.status} claim`);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    void audit({ action: 'delete', entity: 'ExpenseClaim', entityId: String(doc._id) });
    res.json({ success: true, message: 'Expense claim deleted' });
}
/** A bodyless approve (no `acceptedAmount`) approves the full amount. */
export const approveClaimSchema = z
    .object({
    acceptedAmount: z.coerce.number().min(0).optional(),
})
    .default({});
/**
 * Record a decision on a still-pending claim — one conditional write, so of
 * two deciders racing only one lands; the other gets 409 `DECIDED_MEANWHILE`
 * and nobody is notified twice.
 */
async function decidePendingClaim(id, set) {
    const userId = getUserId();
    const decided = await ExpenseClaim.findOneAndUpdate({ _id: id, status: 'pending' }, { $set: { ...set, approvedAt: new Date(), ...(userId ? { approvedBy: new Types.ObjectId(userId) } : {}) } }, { new: true, runValidators: true }).exec();
    if (!decided)
        throw new AppError(DECIDED_MEANWHILE_MESSAGE, 409, 'DECIDED_MEANWHILE');
    return decided;
}
export async function approveClaim(req, res) {
    const body = (req.body ?? {});
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertNotSelfApproval(req, doc.employeeId, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, doc.employeeId, 'expenses');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot approve a ${doc.status} claim`);
    }
    // Payroll pays `acceptedAmount ?? amount`: approving more than was claimed
    // would pay out money nobody asked for.
    if (body.acceptedAmount !== undefined && body.acceptedAmount > doc.amount) {
        throw new ValidationAppError(`The accepted amount (${formatInr(body.acceptedAmount)}) cannot exceed the amount claimed (${formatInr(doc.amount)})`);
    }
    const decided = await decidePendingClaim(doc._id, {
        status: 'approved',
        ...(body.acceptedAmount !== undefined ? { acceptedAmount: body.acceptedAmount } : {}),
    });
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(decided._id), after: { status: 'approved' } });
    const accepted = decided.acceptedAmount;
    await notifyClaimant(decided, 'approved', accepted !== undefined && accepted !== decided.amount ? `was approved for ${formatInr(accepted)}.` : 'was approved.');
    res.json({ success: true, data: decided });
}
export async function rejectClaim(req, res) {
    const body = req.body;
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertNotSelfApproval(req, doc.employeeId, SELF_APPROVAL_MESSAGE);
    await assertCanDecide(req, doc.employeeId, 'expenses');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot reject a ${doc.status} claim`);
    }
    const decided = await decidePendingClaim(doc._id, { status: 'rejected', rejectedReason: body.reason });
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(decided._id), after: { status: 'rejected' } });
    await notifyClaimant(decided, 'rejected', `was rejected. Reason: ${body.reason}`);
    res.json({ success: true, data: decided });
}
/**
 * Manual reimbursement (cash, a separate transfer). Approved claims are
 * otherwise paid with payroll: a payroll record that counted the claim holds
 * it until its cycle is paid and settled, and meanwhile it is refused here —
 * 409 `CLAIM_IN_PAYROLL` — rather than paid twice.
 */
export async function reimburseClaim(req, res) {
    const body = req.body;
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    await assertNotSelfApproval(req, doc.employeeId, 'You cannot reimburse your own claim');
    await assertCanDecide(req, doc.employeeId, 'expenses');
    if (doc.status !== 'approved') {
        throw new ValidationAppError(`Can only reimburse approved claims (current: ${doc.status})`);
    }
    const payroll = await cycleHoldingClaim(doc._id);
    if (payroll) {
        throw new AppError(`This claim is held by the ${cycleLabel(payroll)} payroll until that payroll is paid and settled.`, 409, 'CLAIM_IN_PAYROLL');
    }
    doc.status = 'reimbursed';
    doc.reimbursedAt = new Date();
    doc.reimbursementRef = body.reimbursementRef;
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id), after: { status: 'reimbursed' } });
    await notifyClaimant(doc, 'reimbursed', body.reimbursementRef ? `has been reimbursed (ref ${body.reimbursementRef}).` : 'has been reimbursed.');
    res.json({ success: true, data: doc });
}
// ---------- Reports ----------
export async function expenseReports(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const year = Number(q.year ?? new Date().getFullYear());
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year + 1}-01-01`);
    // Whose claims the figures cover: everybody for `expenses.approve_all`, a
    // manager's direct reports and their own otherwise. Aggregations skip the
    // soft-delete query hook, so deleted claims are excluded here.
    const scope = { ...(await scopeFilter(req, 'expenses')), isDeleted: { $ne: true } };
    const inYear = { ...scope, date: { $gte: start, $lt: end } };
    const settledInYear = { ...inYear, status: { $in: ['approved', 'reimbursed'] } };
    const [byStatus, byCategory, byMonth, total] = await Promise.all([
        ExpenseClaim.aggregate([
            { $match: inYear },
            { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
        ExpenseClaim.aggregate([
            { $match: settledInYear },
            { $group: { _id: '$category', amount: { $sum: '$amount' } } },
            { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'cat' } },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            { $project: { categoryId: '$_id', name: '$cat.name', amount: 1, _id: 0 } },
        ]),
        ExpenseClaim.aggregate([
            { $match: settledInYear },
            { $group: { _id: { $month: '$date' }, amount: { $sum: '$amount' } } },
            { $project: { month: '$_id', amount: 1, _id: 0 } },
            { $sort: { month: 1 } },
        ]),
        ExpenseClaim.aggregate([
            { $match: settledInYear },
            { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
    ]);
    res.json({
        success: true,
        data: {
            year,
            byStatus,
            byCategory,
            byMonth,
            totalApproved: total[0]?.amount ?? 0,
        },
    });
}
//# sourceMappingURL=expense-claims.controller.js.map