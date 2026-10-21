import type { Request, Response } from 'express';
import { Visit } from '../models/visit.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { fieldScope } from '../lib/field-access.js';
import { businessDayWindow } from '../lib/field-utils.js';

/**
 * Today's (IST) field activity over the reps the caller can see: a field
 * manager sees everyone, a team lead themselves plus their direct reports, a
 * rep only themselves.
 */
export async function fieldDashboard(req: Request, res: Response): Promise<void> {
  const { start, end } = businessDayWindow();
  const range = { $gte: start, $lt: end };
  const byEmployee = await fieldScope(req);
  const byAssignee = await fieldScope(req, undefined, 'assignedTo');
  const visitsToday = {
    ...byEmployee,
    $or: [{ 'checkIn.time': range }, { 'checkIn.time': null, createdAt: range }],
  };
  const live = { isDeleted: { $ne: true } };

  const [visitCount, tasksCompleted, ordersAgg, paymentsAgg, recent] = await Promise.all([
    Visit.countDocuments(visitsToday),
    FieldTask.countDocuments({ ...byAssignee, completedAt: range, status: 'completed' }),
    ProductOrder.aggregate([
      { $match: { ...byEmployee, ...live, createdAt: range } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
    ]),
    PaymentCollection.aggregate([
      { $match: { ...byEmployee, ...live, collectedAt: range } },
      { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
    ]),
    Visit.find(visitsToday)
      .populate('clientId', 'name')
      .populate('employeeId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(15)
      .exec(),
  ]);

  const strip = (row?: { count: number; total: number }) => ({ count: row?.count ?? 0, total: row?.total ?? 0 });
  res.json({
    success: true,
    data: {
      date: start,
      visitsToday: visitCount,
      tasksCompleted,
      orders: strip(ordersAgg[0]),
      payments: strip(paymentsAgg[0]),
      recentActivity: recent,
    },
  });
}
