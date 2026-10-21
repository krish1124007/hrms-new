import { z } from 'zod';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { paidTowardsOrder, recomputeAfterCommit } from '../services/field-ledger.service.js';
import { renderPaymentReceipt } from '../services/field-receipt-pdf.service.js';
import { createWithNumber, nextYearlyNumber } from '../lib/sequence.js';
import { assertFieldRead, assertFieldWrite, canManageField, fieldScope, ownerForCreate, requireOwnEmployeeId, visibleEmployeeIds, } from '../lib/field-access.js';
import { logger } from '../config/logger.js';
import { dateBound, escapeRegex, objectIdString, pageParams, rangeFilter, roundMoney, sortParam, windowForDateParam, } from '../lib/field-utils.js';
/*
 * Rules: 0 < amount ≤ ₹10 crore; a linked order must be one the caller may
 * touch, for the same client, not cancelled, and the payment may not take the
 * order past its total; the receipt number comes from a durable counter;
 * every create, edit, delete and status change is audited; the client ledger
 * and the order's paid amount are recomputed from source after each of them.
 *
 * Status machine:
 *   collected → verified           PATCH /:id/verify (manager)
 *   verified → deposited           PATCH /:id/deposit (the collecting rep or a manager)
 *   any other status → bounced     PATCH /:id { status: 'bounced' } (manager)
 *   bounced → collected            PATCH /:id { status: 'collected' } (manager) — only
 *                                  when the order still has room for it
 * Every other move: 409 INVALID_STATUS_TRANSITION.
 */
const METHODS = ['cash', 'cheque', 'upi', 'bank_transfer', 'other'];
const STATUSES = ['collected', 'deposited', 'verified', 'bounced'];
/** The largest single collection: ₹10 crore. */
export const MAX_PAYMENT_AMOUNT = 10_00_00_000;
/** At most this far in the future (clock skew); a collection may be recorded later than it happened. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const notFuture = (d) => d.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS;
/** How far back a rep may date a collection; field managers may go further. */
export const MAX_BACKDATE_DAYS = 7;
const MAX_BACKDATE_MS = MAX_BACKDATE_DAYS * 24 * 60 * 60 * 1000;
/** A bounced cheque is not money received; every other status is. */
const counts = (status) => status !== 'bounced';
export const createPaymentSchema = z.object({
    clientId: objectIdString,
    /** Honoured only for a field manager (record a collection for a rep). */
    employeeId: objectIdString.optional(),
    amount: z.coerce.number().positive().max(MAX_PAYMENT_AMOUNT),
    method: z.enum(METHODS),
    reference: z.string().trim().max(200).optional(),
    collectedAt: z.coerce.date().refine(notFuture, 'collectedAt cannot be in the future').optional(),
    visitId: objectIdString.optional(),
    orderId: objectIdString.optional(),
    notes: z.string().trim().max(2000).optional(),
});
export const updatePaymentSchema = z.object({
    clientId: objectIdString.optional(),
    amount: z.coerce.number().positive().max(MAX_PAYMENT_AMOUNT).optional(),
    method: z.enum(METHODS).optional(),
    reference: z.string().trim().max(200).optional(),
    collectedAt: z.coerce.date().refine(notFuture, 'collectedAt cannot be in the future').optional(),
    /** `null` unlinks the payment from its order. */
    orderId: objectIdString.nullable().optional(),
    notes: z.string().trim().max(2000).optional(),
    /** `bounced` stops the payment counting as received; `collected` takes a bounce back. */
    status: z.enum(['collected', 'bounced']).optional(),
});
export const listQuerySchema = z.object({
    ...pageParams,
    employeeId: objectIdString.optional(),
    clientId: objectIdString.optional(),
    orderId: objectIdString.optional(),
    method: z.enum(METHODS).optional(),
    status: z.enum(STATUSES).optional(),
    from: dateBound('from').optional(),
    to: dateBound('to').optional(),
    sort: sortParam(['collectedAt', 'createdAt', 'amount', 'receiptNumber']).optional(),
});
export const myQuerySchema = z.object({ ...pageParams });
export const outstandingQuerySchema = z.object({ ...pageParams, search: z.string().trim().max(100).optional() });
const LIST_POPULATE = [
    { path: 'clientId', select: 'name company' },
    { path: 'employeeId', select: 'firstName lastName employeeId' },
    { path: 'orderId', select: 'orderNumber totalAmount status' },
];
/** The money-relevant snapshot of a payment for the audit trail. */
const moneyView = (p) => ({
    receiptNumber: p.receiptNumber,
    amount: p.amount,
    method: p.method,
    status: p.status,
    clientId: String(p.clientId),
    orderId: p.orderId ? String(p.orderId) : null,
    employeeId: String(p.employeeId),
});
async function loadPayment(id) {
    const doc = await PaymentCollection.findById(id).exec();
    if (!doc)
        throw new NotFoundError('Payment not found');
    return doc;
}
/**
 * The order a payment of `amount` to `clientId` may be allocated to, or an
 * error: it must exist, be one the caller may touch, belong to the client,
 * not be cancelled, and have at least `amount` still outstanding (ignoring
 * `excludePaymentId`, the payment being edited).
 */
async function assertOrderAllocation(req, orderId, clientId, amount, excludePaymentId) {
    const order = await ProductOrder.findById(orderId).select('employeeId clientId status totalAmount').lean().exec();
    if (!order)
        throw new NotFoundError('Order not found');
    await assertFieldWrite(req, order.employeeId);
    if (String(order.clientId) !== String(clientId)) {
        throw new AppError('The order belongs to a different client', 400, 'ORDER_CLIENT_MISMATCH');
    }
    if (order.status === 'cancelled') {
        throw new AppError('The order is cancelled', 400, 'ORDER_CANCELLED');
    }
    const paid = await paidTowardsOrder(order._id, excludePaymentId);
    const outstanding = roundMoney(order.totalAmount - paid);
    if (amount > outstanding + 0.001) {
        throw new AppError(`Only ${outstanding.toFixed(2)} is outstanding on this order`, 400, 'OVERPAYMENT', { outstanding });
    }
}
export async function listPayments(req, res) {
    const q = req.query;
    const filter = await fieldScope(req, q.employeeId);
    if (q.clientId)
        filter.clientId = q.clientId;
    if (q.orderId)
        filter.orderId = q.orderId;
    if (q.method)
        filter.method = q.method;
    if (q.status)
        filter.status = q.status;
    const range = rangeFilter(q.from, q.to);
    if (range)
        filter.collectedAt = range;
    const result = await PaymentCollection.paginate(filter, {
        page: q.page,
        limit: q.limit,
        sort: q.sort ?? '-collectedAt',
        populate: LIST_POPULATE,
    });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function myPayments(req, res) {
    const q = req.query;
    const result = await PaymentCollection.paginate({ employeeId: await requireOwnEmployeeId(req) }, { page: q.page, limit: q.limit, sort: '-collectedAt', populate: [{ path: 'clientId', select: 'name company' }] });
    res.json({ success: true, data: result.data, pagination: result.pagination });
}
export async function getPayment(req, res) {
    const doc = await PaymentCollection.findById(String(req.params.id))
        .populate('clientId', 'name company phone')
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('orderId', 'orderNumber totalAmount status')
        .exec();
    if (!doc)
        throw new NotFoundError('Payment not found');
    await assertFieldRead(req, doc.employeeId);
    res.json({ success: true, data: doc });
}
/**
 * GET /field/payments/:id/receipt — the receipt as a PDF (rendered on demand).
 * Same visibility as reading the payment.
 */
export async function paymentReceipt(req, res) {
    const doc = await PaymentCollection.findById(String(req.params.id))
        .populate('clientId', 'name company phone address')
        .populate('employeeId', 'firstName lastName employeeId')
        .populate('orderId', 'orderNumber')
        .exec();
    if (!doc)
        throw new NotFoundError('Payment not found');
    await assertFieldRead(req, doc.employeeId);
    const collector = doc.employeeId;
    const pdf = await renderPaymentReceipt({
        receiptNumber: doc.receiptNumber,
        amount: doc.amount,
        method: doc.method,
        reference: doc.reference,
        status: doc.status,
        collectedAt: doc.collectedAt,
        notes: doc.notes,
        client: {
            name: doc.clientId?.name ?? '—',
            company: doc.clientId?.company,
            phone: doc.clientId?.phone,
            address: doc.clientId?.address,
        },
        collectedBy: {
            name: [collector?.firstName, collector?.lastName].filter(Boolean).join(' ') || '—',
            code: collector?.employeeId,
        },
        orderNumber: doc.orderId?.orderNumber,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${doc.receiptNumber}.pdf"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
}
export async function createPayment(req, res) {
    const body = req.body;
    // A rep records what they collected this week; older collections go through a manager.
    if (body.collectedAt && body.collectedAt.getTime() < Date.now() - MAX_BACKDATE_MS && !canManageField(req)) {
        throw new ValidationAppError(`collectedAt can be at most ${MAX_BACKDATE_DAYS} days in the past — ask a field sales manager to record an older collection`, [{ field: 'collectedAt', message: `At most ${MAX_BACKDATE_DAYS} days in the past` }]);
    }
    const employeeId = await ownerForCreate(req, body.employeeId);
    const client = await Client.findById(body.clientId).select('_id').lean().exec();
    if (!client)
        throw new NotFoundError('Client not found');
    if (body.orderId)
        await assertOrderAllocation(req, body.orderId, body.clientId, body.amount);
    if (body.visitId) {
        const visit = await Visit.findById(body.visitId).select('employeeId clientId').lean().exec();
        if (!visit)
            throw new NotFoundError('Visit not found');
        await assertFieldWrite(req, visit.employeeId);
        if (String(visit.clientId) !== body.clientId)
            throw new ValidationAppError('The visit is for a different client');
    }
    const doc = await createWithNumber(() => nextYearlyNumber({ prefix: 'RCPT', model: PaymentCollection, field: 'receiptNumber' }), (receiptNumber) => PaymentCollection.create({
        ...body,
        employeeId,
        amount: roundMoney(body.amount),
        collectedAt: body.collectedAt ?? new Date(),
        receiptNumber,
        status: 'collected',
    }), 'receiptNumber');
    // Two concurrent payments can both pass the outstanding check; whichever
    // finds the order overpaid afterwards withdraws itself.
    if (body.orderId) {
        const order = await ProductOrder.findById(body.orderId).select('totalAmount').lean().exec();
        const paid = await paidTowardsOrder(body.orderId);
        if (order && paid > order.totalAmount + 0.001) {
            await PaymentCollection.deleteOne({ _id: doc._id }).exec();
            throw new AppError('This payment would take the order past its total', 400, 'OVERPAYMENT');
        }
    }
    // The payment is recorded: nothing after this point may fail the request
    // (the client would retry and record it twice).
    if (body.visitId) {
        await Visit.updateOne({ _id: body.visitId }, { $set: { paymentCollected: doc._id } })
            .exec()
            .catch((err) => logger.error({ err, paymentId: String(doc._id) }, 'field: linking the visit to its payment failed'));
    }
    await recomputeAfterCommit({ clients: [doc.clientId], orders: [doc.orderId] }, { paymentId: String(doc._id) });
    await audit({ action: 'create', entity: 'PaymentCollection', entityId: String(doc._id), after: moneyView(doc) });
    res.status(201).json({ success: true, data: doc });
}
/**
 * Field managers: correct amount, method, client, order link; mark a cheque
 * bounced (from any status) or take a bounce back (`bounced → collected`).
 * Whenever the edit makes the payment count towards an order — a new amount,
 * order or client, or an un-bounce — the order must still have room for it.
 */
export async function updatePayment(req, res) {
    const body = req.body;
    const before = await loadPayment(String(req.params.id));
    const changesStatus = body.status !== undefined && body.status !== before.status;
    if (changesStatus) {
        const allowed = body.status === 'bounced' || (body.status === 'collected' && before.status === 'bounced');
        if (!allowed) {
            throw new AppError(`A ${before.status} payment cannot become ${body.status}`, 409, 'INVALID_STATUS_TRANSITION');
        }
    }
    const status = body.status ?? before.status;
    const clientId = body.clientId ?? String(before.clientId);
    const amount = body.amount ?? before.amount;
    // Moving to another client drops an order link the body does not replace.
    let orderId = body.orderId !== undefined ? body.orderId : before.orderId ? String(before.orderId) : null;
    if (body.clientId && body.clientId !== String(before.clientId) && body.orderId === undefined)
        orderId = null;
    if (body.clientId && !(await Client.exists({ _id: body.clientId }).exec())) {
        throw new NotFoundError('Client not found');
    }
    const reallocates = body.amount !== undefined || body.orderId !== undefined || body.clientId !== undefined || !counts(before.status);
    const allocated = Boolean(orderId) && counts(status) && reallocates;
    if (allocated)
        await assertOrderAllocation(req, orderId, clientId, amount, before._id);
    const set = { clientId, amount: roundMoney(amount), orderId };
    for (const key of ['method', 'reference', 'collectedAt', 'notes', 'status']) {
        if (body[key] !== undefined)
            set[key] = body[key];
    }
    // A status change is conditional on the status we checked, so a concurrent
    // deposit/verify/bounce cannot be overwritten.
    const doc = await PaymentCollection.findOneAndUpdate({ _id: before._id, ...(changesStatus ? { status: before.status } : {}) }, { $set: set }, { new: true }).exec();
    if (!doc) {
        if (!changesStatus)
            throw new NotFoundError('Payment not found');
        throw new AppError('The payment changed meanwhile — reload and try again', 409, 'INVALID_STATUS_TRANSITION');
    }
    // Two concurrent edits can both pass the outstanding check; whichever finds
    // the order overpaid afterwards puts the payment back as it was.
    if (allocated) {
        const order = await ProductOrder.findById(orderId).select('totalAmount').lean().exec();
        const paid = await paidTowardsOrder(orderId);
        if (order && paid > order.totalAmount + 0.001) {
            const restore = {};
            const unset = {};
            for (const key of Object.keys(set)) {
                const value = before.get(key);
                if (value === undefined || value === null)
                    unset[key] = '';
                else
                    restore[key] = value;
            }
            await PaymentCollection.updateOne({ _id: before._id }, Object.keys(unset).length > 0 ? { $set: restore, $unset: unset } : { $set: restore }).exec();
            throw new AppError('This change would take the order past its total', 400, 'OVERPAYMENT');
        }
    }
    await recomputeAfterCommit({ clients: [before.clientId, doc.clientId], orders: [before.orderId, doc.orderId] }, { paymentId: String(doc._id) });
    await audit({
        action: 'update',
        entity: 'PaymentCollection',
        entityId: String(doc._id),
        before: moneyView(before),
        after: moneyView(doc),
    });
    res.json({ success: true, data: doc });
}
export async function deletePayment(req, res) {
    const doc = await loadPayment(String(req.params.id));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await doc.softDelete({ by: req.user?._id });
    await recomputeAfterCommit({ clients: [doc.clientId], orders: [doc.orderId] }, { paymentId: String(doc._id) });
    await audit({ action: 'delete', entity: 'PaymentCollection', entityId: String(doc._id), before: moneyView(doc) });
    res.json({ success: true, message: 'Payment deleted' });
}
/** The collecting rep (or a manager) records that a verified payment was deposited. */
export async function depositPayment(req, res) {
    const before = await loadPayment(String(req.params.id));
    await assertFieldWrite(req, before.employeeId);
    const doc = await PaymentCollection.findOneAndUpdate({ _id: before._id, status: 'verified' }, { $set: { status: 'deposited', depositedAt: new Date() } }, { new: true }).exec();
    if (!doc)
        throw new AppError(`A ${before.status} payment cannot be deposited`, 409, 'INVALID_STATUS_TRANSITION');
    await audit({
        action: 'update',
        entity: 'PaymentCollection',
        entityId: String(doc._id),
        before: { status: before.status },
        after: { status: doc.status },
    });
    res.json({ success: true, data: doc });
}
/** Field managers verify a collected payment (before it is deposited). */
export async function verifyPayment(req, res) {
    const before = await loadPayment(String(req.params.id));
    const doc = await PaymentCollection.findOneAndUpdate({ _id: before._id, status: 'collected' }, { $set: { status: 'verified', verifiedBy: req.user?._id } }, { new: true }).exec();
    if (!doc)
        throw new AppError(`A ${before.status} payment cannot be verified`, 409, 'INVALID_STATUS_TRANSITION');
    await audit({
        action: 'update',
        entity: 'PaymentCollection',
        entityId: String(doc._id),
        before: { status: before.status },
        after: { status: doc.status },
    });
    res.json({ success: true, data: doc });
}
/**
 * Collections on one IST day (`?date=YYYY-MM-DD`, default today), in the
 * caller's scope — bounced and deleted payments are not money collected.
 */
export async function dailyReport(req, res) {
    const { start, end } = windowForDateParam(req.query.date);
    const match = {
        ...(await fieldScope(req)),
        collectedAt: { $gte: start, $lt: end },
        isDeleted: { $ne: true },
        status: { $ne: 'bounced' },
    };
    const [byMethod, totals] = await Promise.all([
        PaymentCollection.aggregate([
            { $match: match },
            { $group: { _id: '$method', count: { $sum: 1 }, total: { $sum: '$amount' } } },
        ]),
        PaymentCollection.aggregate([
            { $match: match },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
        ]),
    ]);
    res.json({ success: true, data: { date: start, byMethod, totals: totals[0] ?? { count: 0, total: 0 } } });
}
/**
 * Clients with money outstanding, largest first, paginated. Field managers see
 * every client; anyone else the clients assigned to them or their reports.
 */
export async function outstandingReport(req, res) {
    const q = req.query;
    const ids = await visibleEmployeeIds(req);
    const filter = { outstandingAmount: { $gt: 0 } };
    if (ids !== null)
        filter.assignedTo = { $in: ids };
    if (q.search)
        filter.name = { $regex: escapeRegex(q.search), $options: 'i' };
    const [page, [sum]] = await Promise.all([
        Client.paginate(filter, {
            page: q.page,
            limit: q.limit,
            sort: { outstandingAmount: -1 },
            select: 'name company outstandingAmount totalPayments totalOrders totalOrderValue assignedTo',
            populate: [{ path: 'assignedTo', select: 'firstName lastName' }],
        }),
        Client.aggregate([
            { $match: { ...filter, isDeleted: { $ne: true } } },
            { $group: { _id: null, total: { $sum: '$outstandingAmount' } } },
        ]),
    ]);
    res.json({
        success: true,
        data: { total: roundMoney(sum?.total ?? 0), clients: page.data },
        pagination: page.pagination,
    });
}
//# sourceMappingURL=field-payments.controller.js.map