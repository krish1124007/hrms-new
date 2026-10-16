import type { Request, Response } from 'express';
import { z } from 'zod';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { Client } from '../models/client.model.js';
import { Employee } from '../models/employee.model.js';
import { NotFoundError, ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getUserId } from '../lib/async-context.js';

export const createPaymentSchema = z.object({
  clientId: z.string().min(1),
  employeeId: z.string().optional(),
  amount: z.coerce.number().positive(),
  method: z.enum(['cash', 'cheque', 'upi', 'bank_transfer', 'other']),
  reference: z.string().optional(),
  collectedAt: z.coerce.date().optional(),
  visitId: z.string().optional(),
  orderId: z.string().optional(),
  notes: z.string().optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial();

export const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(20),
  employeeId: z.string().optional(),
  clientId: z.string().optional(),
  method: z.string().optional(),
  status: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.string().optional(),
});

async function resolveEmployeeId(): Promise<string | null> {
  const userId = getUserId();
  if (!userId) return null;
  const emp = await Employee.findOne({ userId }).select('_id').exec();
  return emp ? String(emp._id) : null;
}

async function nextReceiptNumber(): Promise<string> {
  const last = await PaymentCollection.findOne({})
    .sort({ createdAt: -1 })
    .select('receiptNumber')
    .exec();
  let seq = 1;
  if (last) {
    const m = last.receiptNumber.match(/(\d+)$/);
    if (m) seq = Number(m[1]) + 1;
  }
  return `REC-${String(seq).padStart(6, '0')}`;
}

export async function listPayments(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (q.employeeId) filter.employeeId = q.employeeId;
  if (q.clientId) filter.clientId = q.clientId;
  if (q.method) filter.method = q.method;
  if (q.status) filter.status = q.status;
  if (q.from || q.to) {
    filter.collectedAt = {};
    if (q.from) filter.collectedAt.$gte = q.from;
    if (q.to) filter.collectedAt.$lte = q.to;
  }
  const result = await PaymentCollection.paginate(filter, {
    page: q.page,
    limit: q.limit,
    sort: q.sort ?? '-collectedAt',
    populate: [
      { path: 'clientId', select: 'name company' },
      { path: 'employeeId', select: 'firstName lastName employeeCode' },
    ],
  });
  res.json({ success: true, data: result.data, pagination: result.pagination });
}

export async function myPayments(_req: Request, res: Response): Promise<void> {
  const empId = await resolveEmployeeId();
  if (!empId) throw new ValidationAppError('Employee profile not found');
  const docs = await PaymentCollection.find({ employeeId: empId })
    .populate('clientId', 'name')
    .sort({ collectedAt: -1 })
    .exec();
  res.json({ success: true, data: docs });
}

export async function getPayment(req: Request, res: Response): Promise<void> {
  const doc = await PaymentCollection.findById(String(req.params.id))
    .populate('clientId', 'name company phone')
    .populate('employeeId', 'firstName lastName')
    .populate('orderId', 'orderNumber totalAmount')
    .exec();
  if (!doc) throw new NotFoundError('Payment not found');
  res.json({ success: true, data: doc });
}

export async function createPayment(req: Request, res: Response): Promise<void> {
  const body = req.body as z.infer<typeof createPaymentSchema>;
  let employeeId = body.employeeId;
  if (!employeeId) {
    const resolved = await resolveEmployeeId();
    if (!resolved) throw new ValidationAppError('employeeId required');
    employeeId = resolved;
  }
  const receiptNumber = await nextReceiptNumber();
  const doc = await PaymentCollection.create({
    ...body,
    employeeId,
    collectedAt: body.collectedAt ?? new Date(),
    receiptNumber,
  });

  // Reduce client outstanding
  await Client.updateOne(
    { _id: body.clientId },
    { $inc: { totalPayments: body.amount, outstandingAmount: -body.amount } },
  ).exec();

  // Update order paymentStatus if linked
  if (body.orderId) {
    const order = await ProductOrder.findById(body.orderId).exec();
    if (order) {
      const newPaid = order.paidAmount + body.amount;
      let status: 'pending' | 'partial' | 'paid' = 'pending';
      if (newPaid >= order.totalAmount) status = 'paid';
      else if (newPaid > 0) status = 'partial';
      order.paidAmount = newPaid;
      order.paymentStatus = status;
      await order.save();
    }
  }

  void audit({ action: 'create', entity: 'PaymentCollection', entityId: String(doc._id) });
  res.status(201).json({ success: true, data: doc });
}

export async function updatePayment(req: Request, res: Response): Promise<void> {
  const doc = await PaymentCollection.findByIdAndUpdate(
    String(req.params.id),
    req.body,
    { new: true },
  ).exec();
  if (!doc) throw new NotFoundError('Payment not found');
  res.json({ success: true, data: doc });
}

export async function deletePayment(req: Request, res: Response): Promise<void> {
  const doc = await PaymentCollection.findById(String(req.params.id)).exec();
  if (!doc) throw new NotFoundError('Payment not found');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (doc as any).softDelete();
  res.json({ success: true, message: 'Payment deleted' });
}

export async function verifyPayment(req: Request, res: Response): Promise<void> {
  const userId = getUserId();
  const doc = await PaymentCollection.findByIdAndUpdate(
    String(req.params.id),
    { status: 'verified', verifiedBy: userId },
    { new: true },
  ).exec();
  if (!doc) throw new NotFoundError('Payment not found');
  res.json({ success: true, data: doc });
}

export async function dailyReport(req: Request, res: Response): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = req.query as any;
  const date = q.date ? new Date(q.date) : new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  const [byMethod, totals] = await Promise.all([
    PaymentCollection.aggregate([
      { $match: { collectedAt: { $gte: start, $lte: end } } },
      { $group: { _id: '$method', count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    PaymentCollection.aggregate([
      { $match: { collectedAt: { $gte: start, $lte: end } } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
  ]);
  res.json({
    success: true,
    data: {
      date: start,
      byMethod,
      totals: totals[0] ?? { count: 0, total: 0 },
    },
  });
}

export async function outstandingReport(_req: Request, res: Response): Promise<void> {
  const docs = await Client.find({ outstandingAmount: { $gt: 0 } })
    .select('name company outstandingAmount totalPayments totalOrders assignedTo')
    .populate('assignedTo', 'firstName lastName')
    .sort({ outstandingAmount: -1 })
    .exec();
  const total = docs.reduce((s, d) => s + d.outstandingAmount, 0);
  res.json({ success: true, data: { total, clients: docs } });
}
