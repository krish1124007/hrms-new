import { z } from 'zod';
import { ProductOrder } from '../models/product-order.model.js';
import { Client } from '../models/client.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { assertOwnOrPermission, currentEmployeeId, hasPermission } from '../lib/access.js';
/** Field managers see and edit every rep's orders; reps only their own. */
const MANAGE = 'field-sales.manage';
const orderItemSchema = z.object({
    productId: z.string().optional(),
    name: z.string().min(1),
    quantity: z.coerce.number().positive(),
    unitPrice: z.coerce.number().min(0),
    discount: z.coerce.number().min(0).default(0),
    total: z.coerce.number().min(0),
});
export const createOrderSchema = z.object({
    clientId: z.string().min(1),
    employeeId: z.string().optional(),
    items: z.array(orderItemSchema).min(1),
    taxAmount: z.coerce.number().min(0).default(0),
    status: z
        .enum(['draft', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'])
        .default('draft'),
    deliveryDate: z.coerce.date().optional(),
    notes: z.string().optional(),
    visitId: z.string().optional(),
});
export const updateOrderSchema = createOrderSchema.partial();
export const statusSchema = z.object({
    status: z.enum([
        'draft',
        'confirmed',
        'processing',
        'shipped',
        'delivered',
        'cancelled',
    ]),
});
export const listQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(200).default(20),
    employeeId: z.string().optional(),
    clientId: z.string().optional(),
    status: z.string().optional(),
    paymentStatus: z.string().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    sort: z.string().optional(),
});
/** 404 if the order does not exist; 403 unless it is the caller's or they manage. */
async function assertOrderAccess(req, id) {
    const order = await ProductOrder.findById(id).select('employeeId').lean().exec();
    if (!order)
        throw new NotFoundError('Order not found');
    await assertOwnOrPermission(req, order.employeeId, MANAGE);
}
async function nextOrderNumber() {
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prefix = `ORD-${ym}-`;
    const last = await ProductOrder.findOne({ orderNumber: { $regex: `^${prefix}` } })
        .sort({ orderNumber: -1 })
        .select('orderNumber')
        .exec();
    let seq = 1;
    if (last) {
        const m = last.orderNumber.match(/-(\d+)$/);
        if (m)
            seq = Number(m[1]) + 1;
    }
    return `${prefix}${String(seq).padStart(4, '0')}`;
}
export async function listOrders(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter = {};
    if (q.employeeId)
        filter.employeeId = q.employeeId;
    // Reps only ever see their own (`null` — no employee record — matches nothing).
    if (!hasPermission(req.user, MANAGE))
        filter.employeeId = await currentEmployeeId(req);
    if (q.clientId)
        filter.clientId = q.clientId;
    if (q.status)
        filter.status = q.status;
    if (q.paymentStatus)
        filter.paymentStatus = q.paymentStatus;
    if (q.from || q.to) {
        filter.createdAt = {};
        if (q.from)
            filter.createdAt.$gte = q.from;
        if (q.to)
            filter.createdAt.$lte = q.to;
    }
    const result = await ProductOrder.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-createdAt',
        populate: [
            { path: 'clientId', select: 'name company' },
            { path: 'employeeId', select: 'firstName lastName employeeCode' },
        ],
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myOrders(req, res) {
    const empId = await currentEmployeeId(req);
    if (!empId)
        throw new ValidationAppError('Employee profile not found');
    const docs = await ProductOrder.find({ employeeId: empId })
        .populate('clientId', 'name company')
        .sort({ createdAt: -1 })
        .exec();
    res.json({ success: true, data: docs });
}
export async function getOrder(req, res) {
    const doc = await ProductOrder.findById(String(req.params.id))
        .populate('clientId', 'name company phone address')
        .populate('employeeId', 'firstName lastName employeeCode')
        .exec();
    if (!doc)
        throw new NotFoundError('Order not found');
    await assertOwnOrPermission(req, doc.employeeId, MANAGE);
    res.json({ success: true, data: doc });
}
export async function createOrder(req, res) {
    const body = req.body;
    // Only a manager may book an order against another rep.
    let employeeId = hasPermission(req.user, MANAGE) ? body.employeeId : undefined;
    if (!employeeId) {
        const own = await currentEmployeeId(req);
        if (!own)
            throw new ValidationAppError('employeeId required');
        employeeId = String(own);
    }
    const subtotal = body.items.reduce((s, i) => s + i.total, 0);
    const totalAmount = subtotal + (body.taxAmount ?? 0);
    const orderNumber = await nextOrderNumber();
    const doc = await ProductOrder.create({
        ...body,
        employeeId,
        orderNumber,
        subtotal,
        totalAmount,
    });
    // increment client totalOrders
    await Client.updateOne({ _id: body.clientId }, { $inc: { totalOrders: 1, outstandingAmount: totalAmount } }).exec();
    void audit({ action: 'create', entity: 'ProductOrder', entityId: String(doc._id) });
    res.status(201).json({ success: true, data: doc });
}
export async function updateOrder(req, res) {
    const body = req.body;
    await assertOrderAccess(req, String(req.params.id));
    const update = { ...body };
    // A rep can't hand their order to someone else.
    if (!hasPermission(req.user, MANAGE))
        delete update.employeeId;
    if (body.items) {
        const subtotal = body.items.reduce((s, i) => s + i.total, 0);
        update.subtotal = subtotal;
        update.totalAmount = subtotal + (body.taxAmount ?? 0);
    }
    const doc = await ProductOrder.findByIdAndUpdate(String(req.params.id), update, {
        new: true,
    }).exec();
    if (!doc)
        throw new NotFoundError('Order not found');
    res.json({ success: true, data: doc });
}
export async function deleteOrder(req, res) {
    const doc = await ProductOrder.findById(String(req.params.id)).exec();
    if (!doc)
        throw new NotFoundError('Order not found');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete();
    res.json({ success: true, message: 'Order deleted' });
}
export async function updateOrderStatus(req, res) {
    const body = req.body;
    await assertOrderAccess(req, String(req.params.id));
    const doc = await ProductOrder.findByIdAndUpdate(String(req.params.id), { status: body.status }, { new: true }).exec();
    if (!doc)
        throw new NotFoundError('Order not found');
    res.json({ success: true, data: doc });
}
export async function orderReports(req, res) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = req.query;
    const from = q.from ? new Date(q.from) : new Date(new Date().setDate(1));
    const to = q.to ? new Date(q.to) : new Date();
    const match = { createdAt: { $gte: from, $lte: to } };
    // A rep's report covers their own orders only.
    if (!hasPermission(req.user, MANAGE))
        match.employeeId = await currentEmployeeId(req);
    const [byStatus, totals] = await Promise.all([
        ProductOrder.aggregate([
            { $match: match },
            { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        ]),
        ProductOrder.aggregate([
            { $match: match },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    total: { $sum: '$totalAmount' },
                    paid: { $sum: '$paidAmount' },
                },
            },
        ]),
    ]);
    res.json({
        success: true,
        data: {
            from,
            to,
            byStatus,
            totals: totals[0] ?? { count: 0, total: 0, paid: 0 },
        },
    });
}
//# sourceMappingURL=field-orders.controller.js.map