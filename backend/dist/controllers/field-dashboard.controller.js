import { Visit } from '../models/visit.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import { PaymentCollection } from '../models/payment-collection.model.js';
import { FieldTask } from '../models/field-task.model.js';
export async function fieldDashboard(_req, res) {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    const [visitsToday, tasksCompleted, ordersAgg, paymentsAgg, recent] = await Promise.all([
        Visit.countDocuments({ createdAt: { $gte: start, $lte: end } }),
        FieldTask.countDocuments({
            completedAt: { $gte: start, $lte: end },
            status: 'completed',
        }),
        ProductOrder.aggregate([
            { $match: { createdAt: { $gte: start, $lte: end } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$totalAmount' } } },
        ]),
        PaymentCollection.aggregate([
            { $match: { collectedAt: { $gte: start, $lte: end } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: '$amount' } } },
        ]),
        Visit.find({ createdAt: { $gte: start, $lte: end } })
            .populate('clientId', 'name')
            .populate('employeeId', 'firstName lastName')
            .sort({ createdAt: -1 })
            .limit(15)
            .exec(),
    ]);
    res.json({
        success: true,
        data: {
            visitsToday,
            tasksCompleted,
            orders: ordersAgg[0] ?? { count: 0, total: 0 },
            payments: paymentsAgg[0] ?? { count: 0, total: 0 },
            recentActivity: recent,
        },
    });
}
//# sourceMappingURL=field-dashboard.controller.js.map