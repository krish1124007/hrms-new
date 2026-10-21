import type { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentCollection, type IPaymentCollection } from '../models/payment-collection.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { AppError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { paidTowardsOrder, recomputeAfterMutation } from '../services/field-ledger.service.js';
import { createWithNumber, nextYearlyNumber } from '../lib/sequence.js';
import {
  assertFieldRead,
  assertFieldWrite,
  fieldScope,
  ownerForCreate,
  requireOwnEmployeeId,
  visibleEmployeeIds,
} from '../lib/field-access.js';
import {
  dateBound,
  escapeRegex,
  objectIdString,
  pageParams,
  rangeFilter,
  roundMoney,
  sortParam,
  windowForDateParam,
} from '../lib/field-utils.js';

/*
 * Rules: amount > 0; a linked order must be one the caller may touch, for the
 * same client, not cancelled, and the payment may not take the order past its
 * total; the receipt number comes from a durable counter; every create, edit,
 * delete and status change is audited; the client ledger and the order's
 * paid amount are recomputed from source after each of them.
 */

const METHODS = ['cash', 'cheque', 'upi', 'bank_transfer', 'other'] as const;
const STATUSES = ['collected', 'deposited', 'verified', 'bounced'] as const;

/** At most this far in the future (clock skew); a collection may be recorded later than it happened. */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const notFuture = (d: Date) => d.getTime() <= Date.now() + MAX_CLOCK_SKEW_MS;

export const createPaymentSchema = z.object({
  clientId: objectIdString,
  /** Honoured only for a field manager (record a collection for a rep). */
  employeeId: objectIdString.optional(),
  amount: z.coerce.number().positive().max(1e10),
  method: z.enum(METHODS),
  reference: z.string().trim().max(200).optional(),
  collectedAt: z.coerce.date().refine(notFuture, 'collectedAt cannot be in the future').optional(),
  visitId: objectIdString.optional(),
  orderId: objectIdString.optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const updatePaymentSchema = z.object({
  clientId: objectIdString.optional(),
  amount: z.coerce.number().positive().max(1e10).optional(),
  method: z.enum(METHODS).optional(),
  reference: z.string().trim().max(200).optional(),
  collectedAt: z.coerce.date().refine(notFuture, 'collectedAt cannot be in the future').optional(),
  /** `null` unlinks the payment from its order. */
  orderId: objectIdString.nullable().optional(),
  notes: z.string().trim().max(2000).optional(),
  /** A bounced cheque stops counting as received. */
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
const moneyView = (p: IPaymentCollection) => ({
  receiptNumber: p.receiptNumber,
  amount: p.amount,
  method: p.method,
  status: p.status,
  clientId: String(p.clientId),
  orderId: p.orderId ? String(p.orderId) : null,
  employeeId: String(p.employeeId),
});

async function loadPayment(id: string): Promise<IPaymentCollection> {
  const doc = await PaymentCollection.findById(id).exec();
  if (!doc) throw new NotFoundError('Payment not found');
  return doc;
}

/**
 * The order a payment of `amount` to `clientId` may be allocated to, or an
 * error: it must exist, be one the caller may touch, belong to the client,
 * not be cancelled, and have at least `amount` still outstanding (ignoring
 * `excludePaymentId`, the payment being edited).
 */
async function assertOrderAllocation(
  req: Request,
  orderId: string,
  clientId: string,
  amount: number,
  excludePaymentId?: unknown,
): Promise<void> {
  const order = await ProductOrder.findById(orderId).select('employeeId clientId status totalAmount').lean().exec();
  if (!order) throw new NotFoundError('Order not found');
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
    throw new AppError(
      `Only ${outstanding.toFixed(2)} is outstanding on this order`,
      400,
      'OVERPAYMENT',
      { outstanding },
    );
  }
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = await fieldScope(req, q.employeeId);
  if (q.clientId) filter.clientId = q.clientId;
  if (q.orderId) filter.orderId = q.orderId;
  if (q.method) filter.method = q.method;
  if (q.status) filter.status = q.status;
  const range = rangeFilter(q.from, q.to);
  if (range) filter.collectedAt = range;
  const result = await PaymentCollection.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-collectedAt',
    populate: LIST_POPULATE,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myPayments(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof myQuerySchema>;
  const result = await PaymentCollection.paginate(
    { employeeId: await requireOwnEmployeeId(req) },
    { page: q.page, limit: q.limit, sort: '-collectedAt', populate: [{ path: 'clientId', select: 'name company' }] },
  );
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const doc = await PaymentCollection.findById(String(req.params.id))
    .populate('clientId', 'name company phone')
    .populate('employeeId', 'firstName lastName employeeId')
    .populate('orderId', 'orderNumber totalAmount status')
    .exec();
  if (!doc) throw new NotFoundError('Payment not found');
  await assertFieldRead(req, doc.employeeId);
  res.json({ success: true, data: doc });
}

export async function createPayment(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createPaymentSchema>;
  const employeeId = await ownerForCreate(req, body.employeeId);
  const client = await Client.findById(body.clientId).select('_id').lean().exec();
  if (!client) throw new NotFoundError('Client not found');
  if (body.orderId) await assertOrderAllocation(req, body.orderId, body.clientId, body.amount);
  if (body.visitId) {
    const visit = await Visit.findById(body.visitId).select('employeeId clientId').lean().exec();
    if (!visit) throw new NotFoundError('Visit not found');
    await assertFieldWrite(req, visit.employeeId);
    if (String(visit.clientId) !== body.clientId) throw new ValidationAppError('The visit is for a different client');
  }

  const doc = await createWithNumber(
    () => nextYearlyNumber({ prefix: 'RCPT', model: PaymentCollection, field: 'receiptNumber' }),
    (receiptNumber) =>
      PaymentCollection.create({
        ...body,
        employeeId,
        amount: roundMoney(body.amount),
        collectedAt: body.collectedAt ?? new Date(),
        receiptNumber,
        status: 'collected',
      }),
    'receiptNumber',
  );

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

  if (body.visitId) await Visit.updateOne({ _id: body.visitId }, { $set: { paymentCollected: doc._id } }).exec();
  await recomputeAfterMutation({ clients: [doc.clientId], orders: [doc.orderId] });
  await audit({ action: 'create', entity: 'PaymentCollection', entityId: String(doc._id), after: moneyView(doc) });
  res.status(201).json({ success: true, data: doc });
}

/** Field managers: correct amount, method, client, order link, or mark a cheque bounced. */
export async function updatePayment(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updatePaymentSchema>;
  const before = await loadPayment(String(req.params.id));

  const clientId = body.clientId ?? String(before.clientId);
  const amount = body.amount ?? before.amount;
  // Moving to another client drops an order link the body does not replace.
  let orderId: string | null =
    body.orderId !== undefined ? body.orderId : before.orderId ? String(before.orderId) : null;
  if (body.clientId && body.clientId !== String(before.clientId) && body.orderId === undefined) orderId = null;

  if (body.clientId && !(await Client.exists({ _id: body.clientId }).exec())) {
    throw new NotFoundError('Client not found');
  }
  if (orderId && (body.amount !== undefined || body.orderId !== undefined || body.clientId !== undefined)) {
    await assertOrderAllocation(req, orderId, clientId, amount, before._id);
  }

  const set: Record<string, unknown> = { clientId, amount: roundMoney(amount), orderId };
  for (const key of ['method', 'reference', 'collectedAt', 'notes', 'status'] as const) {
    if (body[key] !== undefined) set[key] = body[key];
  }
  const doc = await PaymentCollection.findByIdAndUpdate(before._id, { $set: set }, { new: true }).exec();
  if (!doc) throw new NotFoundError('Payment not found');

  await recomputeAfterMutation({
    clients: [before.clientId, doc.clientId],
    orders: [before.orderId, doc.orderId],
  });
  await audit({
    action: 'update',
    entity: 'PaymentCollection',
    entityId: String(doc._id),
    before: moneyView(before),
    after: moneyView(doc),
  });
  res.json({ success: true, data: doc });
}

export async function deletePayment(req: Request, res: Response): Promise<void> {
  const doc = await loadPayment(String(req.params.id));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete({ by: req.user?._id });
  await recomputeAfterMutation({ clients: [doc.clientId], orders: [doc.orderId] });
  await audit({ action: 'delete', entity: 'PaymentCollection', entityId: String(doc._id), before: moneyView(doc) });
  res.json({ success: true, message: 'Payment deleted' });
}

/** The collecting rep (or a manager) records that the money was deposited. */
export async function depositPayment(req: Request, res: Response): Promise<void> {
  const before = await loadPayment(String(req.params.id));
  await assertFieldWrite(req, before.employeeId);
  const doc = await PaymentCollection.findOneAndUpdate(
    { _id: before._id, status: 'collected' },
    { $set: { status: 'deposited', depositedAt: new Date() } },
    { new: true },
  ).exec();
  if (!doc) throw new AppError(`A ${before.status} payment cannot be deposited`, 409, 'INVALID_STATUS_TRANSITION');
  await audit({
    action: 'update',
    entity: 'PaymentCollection',
    entityId: String(doc._id),
    before: { status: before.status },
    after: { status: doc.status },
  });
  res.json({ success: true, data: doc });
}

/** Field managers reconcile a collected or deposited payment. */
export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const before = await loadPayment(String(req.params.id));
  const doc = await PaymentCollection.findOneAndUpdate(
    { _id: before._id, status: { $in: ['collected', 'deposited'] } },
    { $set: { status: 'verified', verifiedBy: req.user?._id } },
    { new: true },
  ).exec();
  if (!doc) throw new AppError(`A ${before.status} payment cannot be verified`, 409, 'INVALID_STATUS_TRANSITION');
  await audit({
    action: 'update',
    entity: 'PaymentCollection',
    entityId: String(doc._id),
    before: { status: before.status },
    after: { status: doc.status },
  });
  res.json({ success: true, data: doc });
}

/** Collections on one IST day (`?date=YYYY-MM-DD`, default today), in the caller's scope. */
export async function dailyReport(req: Request, res: Response): Promise<void> {
  const { start, end } = windowForDateParam(req.query.date);
  const match: Record<string, unknown> = {
    ...(await fieldScope(req)),
    collectedAt: { $gte: start, $lt: end },
    isDeleted: { $ne: true },
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
export async function outstandingReport(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof outstandingQuerySchema>;
  const ids = await visibleEmployeeIds(req);
  const filter: Record<string, unknown> = { outstandingAmount: { $gt: 0 } };
  if (ids !== null) filter.assignedTo = { $in: ids };
  if (q.search) filter.name = { $regex: escapeRegex(q.search), $options: 'i' };
  const [page, [sum]] = await Promise.all([
    Client.paginate(filter, {
      page: q.page,
      limit: q.limit,
      sort: { outstandingAmount: -1 },
      select: 'name company outstandingAmount totalPayments totalOrders totalOrderValue assignedTo',
      populate: [{ path: 'assignedTo', select: 'firstName lastName' }],
    }),
    Client.aggregate<{ total: number }>([
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
