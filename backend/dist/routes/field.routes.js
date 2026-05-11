import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import * as clients from '../controllers/field-clients.controller.js';
import * as visits from '../controllers/field-visits.controller.js';
import * as tasks from '../controllers/field-tasks.controller.js';
import * as targets from '../controllers/field-targets.controller.js';
import * as orders from '../controllers/field-orders.controller.js';
import * as payments from '../controllers/field-payments.controller.js';
import * as tracking from '../controllers/field-tracking.controller.js';
import { fieldDashboard } from '../controllers/field-dashboard.controller.js';
const router = Router();
router.use(authMiddleware);
/* ── Dashboard ── */
router.get('/dashboard', requirePermission('field-sales.view'), asyncHandler(fieldDashboard));
/* ── Clients ── */
router.get('/clients/nearby', requirePermission('field-sales.view'), validate(clients.nearbyQuerySchema, 'query'), asyncHandler(clients.nearbyClients));
router.get('/clients/map', requirePermission('field-sales.view'), asyncHandler(clients.clientsMap));
router.post('/clients/import', requirePermission('field-sales.manage'), validate(clients.importSchema), asyncHandler(clients.importClients));
router.get('/clients', requirePermission('field-sales.view'), validate(clients.listQuerySchema, 'query'), asyncHandler(clients.listClients));
router.post('/clients', requirePermission('field-sales.manage'), validate(clients.createClientSchema), asyncHandler(clients.createClient));
router.get('/clients/:id', requirePermission('field-sales.view'), asyncHandler(clients.getClient));
router.patch('/clients/:id', requirePermission('field-sales.manage'), validate(clients.updateClientSchema), asyncHandler(clients.updateClient));
router.delete('/clients/:id', requirePermission('field-sales.manage'), asyncHandler(clients.deleteClient));
router.post('/clients/:id/notes', requirePermission('field-sales.view'), validate(clients.addNoteSchema), asyncHandler(clients.addClientNote));
/* ── Visits ── */
router.get('/visits/today', requirePermission('field-sales.view'), asyncHandler(visits.todayVisits));
router.get('/visits/timeline/:employeeId', requirePermission('field-sales.view'), asyncHandler(visits.visitTimeline));
router.post('/visits/check-in', requirePermission('field-sales.view'), validate(visits.checkInSchema), asyncHandler(visits.checkIn));
router.post('/visits/:id/check-out', requirePermission('field-sales.view'), validate(visits.checkOutSchema), asyncHandler(visits.checkOut));
router.get('/visits', requirePermission('field-sales.view'), validate(visits.listQuerySchema, 'query'), asyncHandler(visits.listVisits));
router.post('/visits', requirePermission('field-sales.view'), validate(visits.createVisitSchema), asyncHandler(visits.createVisit));
router.get('/visits/:id', requirePermission('field-sales.view'), asyncHandler(visits.getVisit));
router.patch('/visits/:id', requirePermission('field-sales.view'), validate(visits.updateVisitSchema), asyncHandler(visits.updateVisit));
router.delete('/visits/:id', requirePermission('field-sales.manage'), asyncHandler(visits.deleteVisit));
/* ── Tasks ── */
router.get('/tasks/my', requirePermission('field-sales.view'), asyncHandler(tasks.myTasks));
router.get('/tasks/team', requirePermission('field-sales.view'), asyncHandler(tasks.teamTasks));
router.get('/tasks', requirePermission('field-sales.view'), validate(tasks.listQuerySchema, 'query'), asyncHandler(tasks.listTasks));
router.post('/tasks', requirePermission('field-sales.manage'), validate(tasks.createTaskSchema), asyncHandler(tasks.createTask));
router.get('/tasks/:id', requirePermission('field-sales.view'), asyncHandler(tasks.getTask));
router.patch('/tasks/:id', requirePermission('field-sales.view'), validate(tasks.updateTaskSchema), asyncHandler(tasks.updateTask));
router.delete('/tasks/:id', requirePermission('field-sales.manage'), asyncHandler(tasks.deleteTask));
router.patch('/tasks/:id/accept', requirePermission('field-sales.view'), asyncHandler(tasks.acceptTask));
router.patch('/tasks/:id/complete', requirePermission('field-sales.view'), validate(tasks.completeSchema), asyncHandler(tasks.completeTask));
/* ── Targets ── */
router.get('/targets/my', requirePermission('field-sales.view'), asyncHandler(targets.myTargets));
router.get('/targets/leaderboard', requirePermission('field-sales.view'), asyncHandler(targets.leaderboard));
router.get('/targets/team-summary', requirePermission('field-sales.view'), asyncHandler(targets.teamSummary));
router.get('/targets', requirePermission('field-sales.view'), validate(targets.listQuerySchema, 'query'), asyncHandler(targets.listTargets));
router.post('/targets', requirePermission('field-sales.manage'), validate(targets.createTargetSchema), asyncHandler(targets.createTarget));
router.get('/targets/:id', requirePermission('field-sales.view'), asyncHandler(targets.getTarget));
router.patch('/targets/:id', requirePermission('field-sales.manage'), validate(targets.updateTargetSchema), asyncHandler(targets.updateTarget));
router.delete('/targets/:id', requirePermission('field-sales.manage'), asyncHandler(targets.deleteTarget));
/* ── Orders ── */
router.get('/orders/my', requirePermission('field-sales.view'), asyncHandler(orders.myOrders));
router.get('/orders/reports', requirePermission('field-sales.view'), asyncHandler(orders.orderReports));
router.get('/orders', requirePermission('field-sales.view'), validate(orders.listQuerySchema, 'query'), asyncHandler(orders.listOrders));
router.post('/orders', requirePermission('field-sales.view'), validate(orders.createOrderSchema), asyncHandler(orders.createOrder));
router.get('/orders/:id', requirePermission('field-sales.view'), asyncHandler(orders.getOrder));
router.patch('/orders/:id', requirePermission('field-sales.view'), validate(orders.updateOrderSchema), asyncHandler(orders.updateOrder));
router.delete('/orders/:id', requirePermission('field-sales.manage'), asyncHandler(orders.deleteOrder));
router.patch('/orders/:id/status', requirePermission('field-sales.view'), validate(orders.statusSchema), asyncHandler(orders.updateOrderStatus));
/* ── Payments ── */
router.get('/payments/my', requirePermission('field-sales.view'), asyncHandler(payments.myPayments));
router.get('/payments/reports/daily', requirePermission('field-sales.view'), asyncHandler(payments.dailyReport));
router.get('/payments/reports/outstanding', requirePermission('field-sales.view'), asyncHandler(payments.outstandingReport));
router.get('/payments', requirePermission('field-sales.view'), validate(payments.listQuerySchema, 'query'), asyncHandler(payments.listPayments));
router.post('/payments', requirePermission('field-sales.view'), validate(payments.createPaymentSchema), asyncHandler(payments.createPayment));
router.get('/payments/:id', requirePermission('field-sales.view'), asyncHandler(payments.getPayment));
router.patch('/payments/:id', requirePermission('field-sales.manage'), validate(payments.updatePaymentSchema), asyncHandler(payments.updatePayment));
router.delete('/payments/:id', requirePermission('field-sales.manage'), asyncHandler(payments.deletePayment));
router.patch('/payments/:id/verify', requirePermission('field-sales.manage'), asyncHandler(payments.verifyPayment));
/* ── Live Tracking ── */
router.post('/tracking/batch', requirePermission('field-sales.view'), validate(tracking.batchSchema), asyncHandler(tracking.ingestBatch));
router.get('/tracking/live', requirePermission('field-sales.view'), asyncHandler(tracking.liveTracking));
router.get('/tracking/history/:employeeId', requirePermission('field-sales.view'), asyncHandler(tracking.trackingHistory));
export default router;
//# sourceMappingURL=field.routes.js.map