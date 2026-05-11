import { z } from 'zod';
import { SalesTarget } from '../models/sales-target.model.js';
import { Employee } from '../models/employee.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { Visit } from '../models/visit.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';
const milestoneSchema = z.object({
    value: z.coerce.number(),
    reward: z.string().optional(),
    achieved: z.boolean().default(false),
});
export const createTargetSchema = z.object({
    employeeId: z.string().min(1),
    period: z.object({
        month: z.coerce.number().int().min(1).max(12),
        year: z.coerce.number().int(),
    }),
    type: z.enum(['amount', 'quantity', 'visits']).default('amount'),
    productCategory: z.string().optional(),
    targetValue: z.coerce.number().positive(),
    milestones: z.array(milestoneSchema).optional(),
});
export const updateTargetSchema = createTargetSchema.partial();
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(50),
    employeeId: z.string().optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().optional(),
    type: z.string().optional(),
});
async function resolveEmployeeId() {
    const userId = getUserId();
    if (!userId)
        return null;
    const emp = await Employee.findOne({ userId }).select('_id').exec();
    return emp ? String(emp._id) : null;
}
async function recomputeAchieved(target) {
    const start = new Date(target.period.year, target.period.month - 1, 1);
    const end = new Date(target.period.year, target.period.month, 0, 23, 59, 59, 999);
    let achieved = 0;
    if (target.type === 'amount') {
        const r = await ProductOrder.aggregate([
            {
                $match: {
                    employeeId: target.employeeId,
                    status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
                    createdAt: { $gte: start, $lte: end },
                },
            },
            { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);
        achieved = r[0]?.total ?? 0;
    }
    else if (target.type === 'quantity') {
        const r = await ProductOrder.aggregate([
            {
                $match: {
                    employeeId: target.employeeId,
                    status: { $in: ['confirmed', 'processing', 'shipped', 'delivered'] },
                    createdAt: { $gte: start, $lte: end },
                },
            },
            { $unwind: '$items' },
            { $group: { _id: null, qty: { $sum: '$items.quantity' } } },
        ]);
        achieved = r[0]?.qty ?? 0;
    }
    else if (target.type === 'visits') {
        achieved = await Visit.countDocuments({
            employeeId: target.employeeId,
            status: 'completed',
            createdAt: { $gte: start, $lte: end },
        });
    }
    const pct = target.targetValue ? (achieved / target.targetValue) * 100 : 0;
    const status = pct >= 100 ? 'exceeded' : pct >= 70 ? 'on_track' : 'behind';
    await SalesTarget.updateOne({ _id: target._id }, { $set: { achievedValue: achieved, status } }).exec();
}
export async function listTargets(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.employeeId)
        filter.employeeId = q.employeeId;
    if (q.month)
        filter['period.month'] = q.month;
    if (q.year)
        filter['period.year'] = q.year;
    if (q.type)
        filter.type = q.type;
    const result = await SalesTarget.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: '-period.year -period.month',
        populate: [{ path: 'employeeId', select: 'firstName lastName employeeCode avatar' }],
    });
    // recompute on-the-fly for visible targets
    await Promise.all(result.data.map((t) => recomputeAchieved({
        _id: t._id,
        employeeId: t.employeeId,
        period: t.period,
        type: t.type,
        targetValue: t.targetValue,
        achievedValue: t.achievedValue,
        status: t.status,
    })));
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myTargets(_req, res) {
    const empId = await resolveEmployeeId();
    if (!empId)
        throw new ValidationAppError('Employee profile not found');
    const docs = await SalesTarget.find({ employeeId: empId })
        .sort({ 'period.year': -1, 'period.month': -1 })
        .exec();
    res.json({ success: true, data: docs });
}
export async function getTarget(req, res) {
    const doc = await SalesTarget.findById(String(req.params.id))
        .populate('employeeId', 'firstName lastName employeeCode')
        .exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    res.json({ success: true, data: doc });
}
export async function createTarget(req, res) {
    const body = req.body;
    const doc = await SalesTarget.create(body);
    void audit({ action: 'create', entity: 'SalesTarget', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateTarget(req, res) {
    const doc = await SalesTarget.findByIdAndUpdate(String(req.params.id), req.body, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    res.json({ success: true, data: doc });
}
export async function deleteTarget(req, res) {
    const doc = await SalesTarget.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    res.json({ success: true, message: 'Target deleted' });
}
export async function leaderboard(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const month = q.month ? Number(q.month) : new Date().getMonth() + 1;
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const docs = await SalesTarget.find({
        'period.month': month,
        'period.year': year,
        type: q.type ?? 'amount',
    })
        .populate('employeeId', 'firstName lastName employeeCode avatar')
        .exec();
    // recompute
    await Promise.all(docs.map((t) => recomputeAchieved({
        _id: t._id,
        employeeId: t.employeeId,
        period: t.period,
        type: t.type,
        targetValue: t.targetValue,
        achievedValue: t.achievedValue,
        status: t.status,
    })));
    const refreshed = await SalesTarget.find({
        'period.month': month,
        'period.year': year,
        type: q.type ?? 'amount',
    })
        .populate('employeeId', 'firstName lastName employeeCode avatar')
        .exec();
    refreshed.sort((a, b) => {
        const ap = a.targetValue ? (a.achievedValue / a.targetValue) * 100 : 0;
        const bp = b.targetValue ? (b.achievedValue / b.targetValue) * 100 : 0;
        return bp - ap;
    });
    res.json({ success: true, data: refreshed });
}
export async function teamSummary(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const month = q.month ? Number(q.month) : new Date().getMonth() + 1;
    const year = q.year ? Number(q.year) : new Date().getFullYear();
    const docs = await SalesTarget.find({
        'period.month': month,
        'period.year': year,
    })
        .populate('employeeId', 'firstName lastName')
        .exec();
    const totalTarget = docs.reduce((s, d) => s + d.targetValue, 0);
    const totalAchieved = docs.reduce((s, d) => s + d.achievedValue, 0);
    res.json({
        success: true,
        data: {
            totalTarget,
            totalAchieved,
            percentage: totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0,
            employees: docs.length,
            details: docs,
        },
    });
}
//# sourceMappingURL=field-targets.controller.js.map