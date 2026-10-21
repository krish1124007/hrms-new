import type { Request, Response } from 'express';
import { z } from 'zod';
import { ProductOrder, type IProductOrder, type OrderStatus } from '../models/product-order.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { Product } from '../models/product.model.js';
import { AppError, ForbiddenError, NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { recomputeAfterMutation } from '../services/field-ledger.service.js';
import { createWithNumber, nextYearlyNumber } from '../lib/sequence.js';
import {
  assertFieldRead,
  assertFieldWrite,
  canManageField,
  fieldScope,
  ownerForCreate,
  requireOwnEmployeeId,
} from '../lib/field-access.js';
import {
  businessDayWindow,
  businessMonthWindow,
  businessYearMonth,
  dateBound,
  objectIdString,
  pageParams,
  rangeFilter,
  roundMoney,
  sortParam,
} from '../lib/field-utils.js';

/*
 * Status machine:  pending → confirmed → delivered,  pending | confirmed → cancelled.
 * A rep may cancel their own pending order; confirming, delivering and
 * cancelling a confirmed order need `field-sales.manage` (a rep cannot
 * self-confirm to reach a target). Legacy `draft` behaves as `pending`,
 * `processing`/`shipped` as `confirmed`.
 *
 * Lines name a catalogue product, a quantity and an optional discount
 * percent; name, SKU, unit, unit price and GST rate come from the catalogue
 * and every amount is computed here — prices or totals the client sends are
 * ignored. Orders booked before the catalogue (free-text lines) still read.
 */

const STATUSES = ['pending', 'confirmed', 'delivered', 'cancelled'] as const;
/** Old spellings accepted on input. */
const STATUS_ALIASES: Record<string, (typeof STATUSES)[number]> = { draft: 'pending' };
const statusSchema_ = z.preprocess(
  (v) => (typeof v === 'string' ? (STATUS_ALIASES[v] ?? v) : v),
  z.enum(STATUSES),
);

/** Which stored statuses a target status may be reached from. */
const TRANSITIONS: Record<Exclude<(typeof STATUSES)[number], 'pending'>, OrderStatus[]> = {
  confirmed: ['pending', 'draft'],
  delivered: ['confirmed', 'processing', 'shipped'],
  cancelled: ['pending', 'draft', 'confirmed', 'processing', 'shipped'],
};
const OPEN_STATUSES: OrderStatus[] = ['pending', 'draft'];

const orderItemSchema = z.object({
  productId: objectIdString,
  quantity: z.coerce.number().positive().max(1_000_000),
  /** Line discount in percent (0–100); `discount` is the mobile app's name for it. */
  discountPercent: z.coerce.number().min(0).max(100).optional(),
  discount: z.coerce.number().min(0).max(100).optional(),
});

export const createOrderSchema = z.object({
  clientId: objectIdString,
  /** Honoured only for a field manager (book an order for a rep). */
  employeeId: objectIdString.optional(),
  items: z.array(orderItemSchema).min(1).max(200),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
  visitId: objectIdString.optional(),
});

export const updateOrderSchema = z.object({
  items: z.array(orderItemSchema).min(1).max(200).optional(),
  deliveryDate: z.coerce.date().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const statusSchema = z.object({ status: statusSchema_ });

export const listQuerySchema = z.object({
  ...pageParams,
  employeeId: objectIdString.optional(),
  clientId: objectIdString.optional(),
  status: statusSchema_.optional(),
  paymentStatus: z.enum(['pending', 'partial', 'paid']).optional(),
  from: dateBound('from').optional(),
  to: dateBound('to').optional(),
  sort: sortParam(['createdAt', 'totalAmount', 'orderNumber']).optional(),
});

export const myQuerySchema = z.object({ ...pageParams, status: statusSchema_.optional() });

export const reportQuerySchema = z.object({
  from: dateBound('from').optional(),
  to: dateBound('to').optional(),
  employeeId: objectIdString.optional(),
});

const LIST_POPULATE = [
  { path: 'clientId', select: 'name company' },
  { path: 'employeeId', select: 'firstName lastName employeeId' },
];

type ItemInput = z.infer<typeof orderItemSchema>;

/**
 * Price `items` from the catalogue: 400 PRODUCT_NOT_FOUND for an unknown or
 * deleted product, 400 PRODUCT_INACTIVE for an inactive one.
 *
 *   lineSubtotal = qty × price × (1 − discount%),  lineGst = lineSubtotal × gstRate%,
 *   lineTotal = lineSubtotal + lineGst;  order subtotal / taxAmount (gstTotal) /
 *   totalAmount (total) are the sums — every figure paise-rounded.
 */
async function priceItems(items: ItemInput[]) {
  const ids = [...new Set(items.map((i) => i.productId))];
  const products = await Product.find({ _id: { $in: ids } }).lean().exec();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let gross = 0;
  const lines = items.map((item, index) => {
    const product = byId.get(item.productId);
    if (!product) {
      throw new AppError(`Line ${index + 1}: product not found`, 400, 'PRODUCT_NOT_FOUND', { productId: item.productId });
    }
    if (!product.isActive) {
      throw new AppError(`Line ${index + 1}: ${product.name} is not available for orders`, 400, 'PRODUCT_INACTIVE', {
        productId: item.productId,
      });
    }
    const discountPercent = item.discountPercent ?? item.discount ?? 0;
    const lineGross = roundMoney(item.quantity * product.price);
    const lineSubtotal = roundMoney(lineGross * (1 - discountPercent / 100));
    const lineGst = roundMoney((lineSubtotal * product.gstRate) / 100);
    const lineTotal = roundMoney(lineSubtotal + lineGst);
    gross += lineGross;
    return {
      productId: product._id,
      name: product.name,
      sku: product.sku,
      unit: product.unit,
      category: product.category,
      hsnCode: product.hsnCode,
      quantity: item.quantity,
      unitPrice: product.price,
      discountPercent,
      gstRate: product.gstRate,
      lineSubtotal,
      lineGst,
      lineTotal,
      // Older readers' names for the same figures.
      discount: discountPercent,
      total: lineTotal,
    };
  });
  const subtotal = roundMoney(lines.reduce((sum, l) => sum + l.lineSubtotal, 0));
  const taxAmount = roundMoney(lines.reduce((sum, l) => sum + l.lineGst, 0));
  return {
    items: lines,
    subtotal,
    discountTotal: roundMoney(gross - subtotal),
    taxAmount,
    totalAmount: roundMoney(subtotal + taxAmount),
  };
}

async function loadOrder(id: string): Promise<IProductOrder> {
  const order = await ProductOrder.findById(id).exec();
  if (!order) throw new NotFoundError('Order not found');
  return order;
}

/** The money-relevant snapshot of an order for the audit trail. */
const moneyView = (o: Pick<IProductOrder, 'orderNumber' | 'status' | 'subtotal' | 'taxAmount' | 'totalAmount' | 'clientId' | 'employeeId'>) => ({
  orderNumber: o.orderNumber,
  status: o.status,
  subtotal: o.subtotal,
  taxAmount: o.taxAmount,
  totalAmount: o.totalAmount,
  clientId: String(o.clientId),
  employeeId: String(o.employeeId),
});

export async function listOrders(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof listQuerySchema>;
  const filter: Record<string, unknown> = await fieldScope(req, q.employeeId);
  if (q.clientId) filter.clientId = q.clientId;
  if (q.status) filter.status = q.status === 'pending' ? { $in: OPEN_STATUSES } : q.status;
  if (q.paymentStatus) filter.paymentStatus = q.paymentStatus;
  const range = rangeFilter(q.from, q.to);
  if (range) filter.createdAt = range;
  const result = await ProductOrder.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-createdAt',
    populate: LIST_POPULATE,
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myOrders(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof myQuerySchema>;
  const filter: Record<string, unknown> = { employeeId: await requireOwnEmployeeId(req) };
  if (q.status) filter.status = q.status === 'pending' ? { $in: OPEN_STATUSES } : q.status;
  const result = await ProductOrder.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: '-createdAt',
    populate: [{ path: 'clientId', select: 'name company' }],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function getOrder(req: Request, res: Response): Promise<void> {
  const doc = await ProductOrder.findById(String(req.params.id))
    .populate('clientId', 'name company phone address')
    .populate('employeeId', 'firstName lastName employeeId')
    .exec();
  if (!doc) throw new NotFoundError('Order not found');
  await assertFieldRead(req, doc.employeeId);
  res.json({ success: true, data: doc });
}

export async function createOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createOrderSchema>;
  const employeeId = await ownerForCreate(req, body.employeeId);
  const client = await Client.findById(body.clientId).select('_id').lean().exec();
  if (!client) throw new NotFoundError('Client not found');
  if (body.visitId) {
    const visit = await Visit.findById(body.visitId).select('employeeId clientId').lean().exec();
    if (!visit) throw new NotFoundError('Visit not found');
    await assertFieldWrite(req, visit.employeeId);
    if (String(visit.clientId) !== body.clientId) {
      throw new ValidationAppError('The visit is for a different client');
    }
  }

  const priced = await priceItems(body.items);
  const doc = await createWithNumber(
    () => nextYearlyNumber({ prefix: 'ORD', model: ProductOrder, field: 'orderNumber' }),
    (orderNumber) =>
      ProductOrder.create({
        orderNumber,
        employeeId,
        clientId: body.clientId,
        ...priced,
        status: 'pending',
        deliveryDate: body.deliveryDate,
        notes: body.notes,
        visitId: body.visitId,
      }),
    'orderNumber',
  );
  if (body.visitId) await Visit.updateOne({ _id: body.visitId }, { $set: { orderPlaced: doc._id } }).exec();
  await recomputeAfterMutation({ clients: [doc.clientId] });
  await audit({ action: 'create', entity: 'ProductOrder', entityId: String(doc._id), after: moneyView(doc) });
  res.status(201).json({ success: true, data: doc });
}

/** Edit notes/delivery date; items only while the order is still pending (repriced here). */
export async function updateOrder(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof updateOrderSchema>;
  const order = await loadOrder(String(req.params.id));
  await assertFieldWrite(req, order.employeeId);

  const set: Record<string, unknown> = {};
  if (body.notes !== undefined) set.notes = body.notes;
  if (body.deliveryDate !== undefined) set.deliveryDate = body.deliveryDate;
  const filter: Record<string, unknown> = { _id: order._id };
  if (body.items) {
    if (!OPEN_STATUSES.includes(order.status)) {
      throw new AppError('Only a pending order can be changed', 409, 'ORDER_LOCKED');
    }
    const priced = await priceItems(body.items);
    if (priced.totalAmount < order.paidAmount) {
      throw new AppError(
        'The new total is below what has already been collected against this order',
        400,
        'ORDER_TOTAL_BELOW_PAID',
      );
    }
    Object.assign(set, priced);
    filter.status = { $in: OPEN_STATUSES }; // still pending when we write
  }

  const doc = await ProductOrder.findOneAndUpdate(filter, { $set: set }, { new: true }).exec();
  if (!doc) throw new AppError('Only a pending order can be changed', 409, 'ORDER_LOCKED');
  if (body.items) {
    await recomputeAfterMutation({ orders: [doc._id], clients: [doc.clientId] });
    await audit({
      action: 'update',
      entity: 'ProductOrder',
      entityId: String(doc._id),
      before: moneyView(order),
      after: moneyView(doc),
    });
  }
  res.json({ success: true, data: doc });
}

/** Soft-delete (field managers). An order with payments against it is cancelled instead. */
export async function deleteOrder(req: Request, res: Response): Promise<void> {
  const order = await loadOrder(String(req.params.id));
  const payments = await PaymentCollection.countDocuments({ orderId: order._id }).exec();
  if (payments > 0) {
    throw new AppError(
      'Payments are recorded against this order — cancel it, or move or delete the payments first',
      409,
      'ORDER_HAS_PAYMENTS',
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (order as any).softDelete({ by: req.user?._id });
  await recomputeAfterMutation({ clients: [order.clientId] });
  await audit({ action: 'delete', entity: 'ProductOrder', entityId: String(order._id), before: moneyView(order) });
  res.json({ success: true, message: 'Order deleted' });
}

export async function updateOrderStatus(req: Request, res: Response): Promise<void> {
  const { status } = req.body as z.infer<typeof statusSchema>;
  const order = await loadOrder(String(req.params.id));
  await assertFieldWrite(req, order.employeeId);
  const manager = canManageField(req);

  if (status === 'pending') {
    throw new AppError('An order cannot go back to pending', 409, 'INVALID_STATUS_TRANSITION');
  }
  const from = TRANSITIONS[status];
  if (!from.includes(order.status)) {
    throw new AppError(
      `A ${order.status} order cannot become ${status}`,
      409,
      'INVALID_STATUS_TRANSITION',
    );
  }
  // A rep may only withdraw their own pending order.
  const repMayDo = status === 'cancelled' && OPEN_STATUSES.includes(order.status);
  if (!manager && !repMayDo) {
    throw new ForbiddenError('Only a field sales manager can confirm, deliver or cancel a confirmed order');
  }

  const now = new Date();
  const stamp: Record<string, unknown> = { status };
  if (status === 'confirmed') Object.assign(stamp, { confirmedAt: now, confirmedBy: req.user?._id });
  if (status === 'delivered') Object.assign(stamp, { deliveredAt: now, deliveredBy: req.user?._id });
  if (status === 'cancelled') Object.assign(stamp, { cancelledAt: now, cancelledBy: req.user?._id });

  // Conditional on the status we checked, so concurrent transitions cannot both apply.
  const doc = await ProductOrder.findOneAndUpdate(
    { _id: order._id, status: order.status },
    { $set: stamp },
    { new: true },
  ).exec();
  if (!doc) throw new AppError('The order changed meanwhile — reload and try again', 409, 'INVALID_STATUS_TRANSITION');
  await recomputeAfterMutation({ clients: [doc.clientId] });
  await audit({
    action: 'update',
    entity: 'ProductOrder',
    entityId: String(doc._id),
    before: { status: order.status },
    after: { status: doc.status, totalAmount: doc.totalAmount },
  });
  res.json({ success: true, data: doc });
}

/** Totals by status over `[from, to)` (default: this IST month to now), in the caller's scope. */
export async function orderReports(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof reportQuerySchema>;
  const { year, month } = businessYearMonth();
  const from = q.from ?? businessMonthWindow(year, month).start;
  const to = q.to ?? businessDayWindow().end;
  const match: Record<string, unknown> = {
    ...(await fieldScope(req, q.employeeId)),
    createdAt: { $gte: from, $lt: to },
    isDeleted: { $ne: true },
  };
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
    data: { from, to, byStatus, totals: totals[0] ?? { count: 0, total: 0, paid: 0 } },
  });
}
