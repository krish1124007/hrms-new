import { Types } from 'mongoose';
import { z } from 'zod';
import { ExpenseCategory, ExpenseClaim, Employee } from '../models/index.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
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
export const createClaimSchema = z.object({
    employeeId: z.string().optional(),
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
});
export const updateClaimSchema = createClaimSchema.partial().omit({ employeeId: true });
export const claimQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['draft', 'pending', 'approved', 'rejected', 'reimbursed']).optional(),
    employeeId: z.string().optional(),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = { amount: { $gt: 0 } };
    if (q.status)
        filter.status = q.status;
    if (q.employeeId)
        filter.employeeId = new Types.ObjectId(q.employeeId);
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
    let employeeId;
    if (body.employeeId) {
        employeeId = new Types.ObjectId(body.employeeId);
    }
    else {
        const me = await getCurrentEmployee();
        if (!me)
            throw new NotFoundError('Employee profile not found');
        employeeId = me._id;
    }
    // Validate against category limit + receipt requirement
    const cat = await ExpenseCategory.findById(body.category).exec();
    if (!cat)
        throw new NotFoundError('Expense category not found');
    if (cat.limit && body.amount > cat.limit) {
        throw new ValidationAppError(`Amount exceeds category limit of ${cat.limit}`);
    }
    if (cat.requiresReceipt && body.receiptUrls.length === 0) {
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
    res.json({ success: true, data: doc });
}
export async function updateClaim(req, res) {
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    if (doc.status !== 'draft' && doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot edit a ${doc.status} claim`);
    }
    Object.assign(doc, req.body);
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id) });
    res.json({ success: true, data: doc });
}
export async function deleteClaim(req, res) {
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    void audit({ action: 'delete', entity: 'ExpenseClaim', entityId: String(doc._id) });
    res.json({ success: true, message: 'Expense claim deleted' });
}
export const approveClaimSchema = z.object({
    acceptedAmount: z.coerce.number().min(0).optional(),
});
export async function approveClaim(req, res) {
    const body = req.body;
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot approve a ${doc.status} claim`);
    }
    doc.status = 'approved';
    if (body.acceptedAmount !== undefined) {
        doc.acceptedAmount = body.acceptedAmount;
    }
    const userId = getUserId();
    if (userId)
        doc.approvedBy = new Types.ObjectId(userId);
    doc.approvedAt = new Date();
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id), after: { status: 'approved' } });
    res.json({ success: true, data: doc });
}
export async function rejectClaim(req, res) {
    const body = req.body;
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    if (doc.status !== 'pending') {
        throw new ValidationAppError(`Cannot reject a ${doc.status} claim`);
    }
    doc.status = 'rejected';
    doc.rejectedReason = body.reason;
    const userId = getUserId();
    if (userId)
        doc.approvedBy = new Types.ObjectId(userId);
    doc.approvedAt = new Date();
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id), after: { status: 'rejected' } });
    res.json({ success: true, data: doc });
}
export async function reimburseClaim(req, res) {
    const body = req.body;
    const doc = await ExpenseClaim.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Expense claim not found');
    if (doc.status !== 'approved') {
        throw new ValidationAppError(`Can only reimburse approved claims (current: ${doc.status})`);
    }
    doc.status = 'reimbursed';
    doc.reimbursedAt = new Date();
    doc.reimbursementRef = body.reimbursementRef;
    await doc.save();
    void audit({ action: 'update', entity: 'ExpenseClaim', entityId: String(doc._id), after: { status: 'reimbursed' } });
    res.json({ success: true, data: doc });
}
// ---------- Reports ----------
export async function expenseReports(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const year = Number(q.year ?? new Date().getFullYear());
    const start = new Date(`${year}-01-01`);
    const end = new Date(`${year + 1}-01-01`);
    const [byStatus, byCategory, byMonth, total] = await Promise.all([
        ExpenseClaim.aggregate([
            { $match: { date: { $gte: start, $lt: end } } },
            { $group: { _id: '$status', n: { $sum: 1 }, amount: { $sum: '$amount' } } },
        ]),
        ExpenseClaim.aggregate([
            { $match: { status: { $in: ['approved', 'reimbursed'] }, date: { $gte: start, $lt: end } } },
            { $group: { _id: '$category', amount: { $sum: '$amount' } } },
            { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'cat' } },
            { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
            { $project: { categoryId: '$_id', name: '$cat.name', amount: 1, _id: 0 } },
        ]),
        ExpenseClaim.aggregate([
            { $match: { status: { $in: ['approved', 'reimbursed'] }, date: { $gte: start, $lt: end } } },
            { $group: { _id: { $month: '$date' }, amount: { $sum: '$amount' } } },
            { $project: { month: '$_id', amount: 1, _id: 0 } },
            { $sort: { month: 1 } },
        ]),
        ExpenseClaim.aggregate([
            { $match: { status: { $in: ['approved', 'reimbursed'] }, date: { $gte: start, $lt: end } } },
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