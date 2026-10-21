import { z } from 'zod';
import { Types } from 'mongoose';
import { SalesTarget } from '../models/sales-target.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { Visit } from '../models/visit.model.js';
import { AppError, NotFoundError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { idOf } from '../lib/access.js';
import { RECEIVABLE_ORDER_STATUSES } from '../services/field-ledger.service.js';
import { assertEmployeeExists, assertFieldRead, fieldScope, requireOwnEmployeeId, } from '../lib/field-access.js';
import { businessMonthWindow, businessYearMonth, objectIdString, pageParams, setAndUnset } from '../lib/field-utils.js';
/*
 * Achievement is always computed when a target is read — never stored — from
 * the rep's confirmed/delivered orders (amount, quantity) or completed visits
 * in the target's IST calendar month. `status` is computed with it:
 * `exceeded` at ≥ 100 %; otherwise `on_track` while the achievement keeps
 * pace with the share of the month gone by (and before the month starts),
 * `behind` when it does not (and once the month is over).
 */
const TYPES = ['amount', 'quantity', 'visits'];
const milestoneSchema = z.object({
    value: z.coerce.number().positive(),
    reward: z.string().trim().max(200).optional(),
});
const periodSchema = z.object({
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
});
export const createTargetSchema = z.object({
    employeeId: objectIdString,
    period: periodSchema,
    type: z.enum(TYPES).default('amount'),
    productCategory: z.string().trim().max(100).optional(),
    targetValue: z.coerce.number().positive(),
    milestones: z.array(milestoneSchema).max(20).optional(),
});
export const updateTargetSchema = z.object({
    period: periodSchema.optional(),
    type: z.enum(TYPES).optional(),
    /** `null` clears the category (the target then counts every product). */
    productCategory: z.string().trim().max(100).nullable().optional(),
    targetValue: z.coerce.number().positive().optional(),
    milestones: z.array(milestoneSchema).max(20).optional(),
});
export const listQuerySchema = z.object({
    ...pageParams,
    limit: z.coerce.number().int().positive().max(100).default(50),
    employeeId: objectIdString.optional(),
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    type: z.enum(TYPES).optional(),
});
export const periodQuerySchema = z.object({
    month: z.coerce.number().int().min(1).max(12).optional(),
    year: z.coerce.number().int().min(2000).max(2100).optional(),
    type: z.enum(TYPES).default('amount'),
});
/** The rep's achievement towards `target`, from source rows. */
export async function achievedFor(target) {
    const hex = idOf(target.employeeId);
    if (!hex)
        return 0;
    const employeeId = new Types.ObjectId(hex);
    const { start, end } = businessMonthWindow(target.period.year, target.period.month);
    if (target.type === 'visits') {
        const range = { $gte: start, $lt: end };
        return Visit.countDocuments({
            employeeId,
            status: 'completed',
            $or: [{ 'checkIn.time': range }, { 'checkIn.time': null, createdAt: range }],
        }).exec();
    }
    const pipeline = [
        {
            $match: {
                employeeId,
                isDeleted: { $ne: true },
                status: { $in: RECEIVABLE_ORDER_STATUSES },
                createdAt: { $gte: start, $lt: end },
            },
        },
    ];
    const byLine = target.type === 'quantity' || Boolean(target.productCategory);
    if (byLine) {
        pipeline.push({ $unwind: '$items' });
        if (target.productCategory)
            pipeline.push({ $match: { 'items.category': target.productCategory } });
    }
    const value = target.type === 'quantity'
        ? '$items.quantity'
        : byLine
            ? { $ifNull: ['$items.lineTotal', '$items.total'] }
            : '$totalAmount';
    pipeline.push({ $group: { _id: null, total: { $sum: value } } });
    const [row] = await ProductOrder.aggregate(pipeline);
    return Math.round((row?.total ?? 0) * 100) / 100;
}
/** On-track/behind/exceeded for `pct` % achieved in `period`, as of `now`. */
export function targetStatus(pct, period, now = new Date()) {
    if (pct >= 100)
        return 'exceeded';
    const { start, end } = businessMonthWindow(period.year, period.month);
    if (now.getTime() < start.getTime())
        return 'on_track';
    if (now.getTime() >= end.getTime())
        return 'behind';
    const elapsed = ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
    return pct >= elapsed ? 'on_track' : 'behind';
}
/** A target as returned by the API: stored fields plus freshly computed achievement. */
async function present(doc) {
    const achievedValue = await achievedFor(doc);
    const pct = doc.targetValue ? (achievedValue / doc.targetValue) * 100 : 0;
    return {
        ...doc.toJSON(),
        achievedValue,
        percentage: Math.round(pct),
        status: targetStatus(pct, doc.period),
        milestones: doc.milestones.map((m) => ({ value: m.value, reward: m.reward, achieved: achievedValue >= m.value })),
    };
}
const presentAll = (docs) => Promise.all(docs.map(present));
async function loadTarget(id) {
    const doc = await SalesTarget.findById(id).populate('employeeId', 'firstName lastName employeeId avatar').exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    return doc;
}
export async function listTargets(req, res) {
    const q = req.query;
    const filter = await fieldScope(req, q.employeeId);
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
        populate: [{ path: 'employeeId', select: 'firstName lastName employeeId avatar' }],
    });
    res.json({ success: true, data: await presentAll(result.data), pagination: result.pagination });
}
export async function myTargets(req, res) {
    const empId = await requireOwnEmployeeId(req);
    const docs = await SalesTarget.find({ employeeId: empId })
        .sort({ 'period.year': -1, 'period.month': -1 })
        .limit(36)
        .exec();
    res.json({ success: true, data: await presentAll(docs) });
}
export async function getTarget(req, res) {
    const doc = await loadTarget(String(req.params.id));
    await assertFieldRead(req, doc.employeeId);
    res.json({ success: true, data: await present(doc) });
}
/** Field managers. Re-creating a target that was deleted revives that row with the new values. */
export async function createTarget(req, res) {
    const body = req.body;
    await assertEmployeeExists(body.employeeId);
    const key = {
        employeeId: body.employeeId,
        'period.month': body.period.month,
        'period.year': body.period.year,
        type: body.type,
    };
    const twin = await SalesTarget.findOne(key).setOptions({ withDeleted: true }).exec();
    if (twin && !twin.get('isDeleted')) {
        throw new AppError('This rep already has a target of that type for that month', 409, 'TARGET_EXISTS');
    }
    const fields = {
        productCategory: body.productCategory,
        targetValue: body.targetValue,
        milestones: (body.milestones ?? []).map((m) => ({ ...m, achieved: false })),
    };
    let doc;
    if (twin) {
        twin.set({ ...fields, isDeleted: false, deletedAt: null, deletedBy: null, deleteReason: null });
        doc = await twin.save();
    }
    else {
        doc = await SalesTarget.create({ ...body, ...fields });
    }
    void audit({ action: 'create', entity: 'SalesTarget', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: await present(doc) });
}
export async function updateTarget(req, res) {
    const body = req.body;
    const set = { ...body };
    if (body.milestones)
        set.milestones = body.milestones.map((m) => ({ ...m, achieved: false }));
    const doc = await SalesTarget.findByIdAndUpdate(String(req.params.id), setAndUnset(set), { new: true }).exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    void audit({ action: 'update', entity: 'SalesTarget', entityId: String(doc._id) });
    res.json({ success: true, data: await present(doc) });
}
export async function deleteTarget(req, res) {
    const doc = await SalesTarget.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Target not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete({ by: req.user?._id });
    void audit({ action: 'delete', entity: 'SalesTarget', entityId: String(doc._id) });
    res.json({ success: true, message: 'Target deleted' });
}
function periodOf(q) {
    const now = businessYearMonth();
    return { month: q.month ?? now.month, year: q.year ?? now.year };
}
/** Every rep's target of one type for a month (default: this IST month, amount), best first. */
export async function leaderboard(req, res) {
    const q = req.query;
    const { month, year } = periodOf(q);
    const docs = await SalesTarget.find({ 'period.month': month, 'period.year': year, type: q.type })
        .populate('employeeId', 'firstName lastName employeeId avatar')
        .limit(500)
        .exec();
    const rows = await presentAll(docs);
    rows.sort((a, b) => Number(b.percentage) - Number(a.percentage));
    res.json({ success: true, data: rows });
}
/** Targets vs achievement for one month and type, over the reps the caller can see. */
export async function teamSummary(req, res) {
    const q = req.query;
    const { month, year } = periodOf(q);
    const docs = await SalesTarget.find({
        ...(await fieldScope(req)),
        'period.month': month,
        'period.year': year,
        type: q.type,
    })
        .populate('employeeId', 'firstName lastName employeeId')
        .limit(500)
        .exec();
    const details = await presentAll(docs);
    const totalTarget = details.reduce((s, d) => s + Number(d.targetValue), 0);
    const totalAchieved = details.reduce((s, d) => s + Number(d.achievedValue), 0);
    res.json({
        success: true,
        data: {
            month,
            year,
            type: q.type,
            totalTarget,
            totalAchieved,
            percentage: totalTarget ? Math.round((totalAchieved / totalTarget) * 100) : 0,
            employees: details.length,
            details,
        },
    });
}
//# sourceMappingURL=field-targets.controller.js.map