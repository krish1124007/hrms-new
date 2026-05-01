import { Router } from 'express';
import * as ctrl from '../controllers/leaves.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// ---------- Leave Types ----------
router.get(
  '/types',
  requirePermission('leaves.view'),
  validate(ctrl.leaveTypeQuerySchema, 'query'),
  asyncHandler(ctrl.listLeaveTypes),
);
router.post(
  '/types',
  requirePermission('leaves.create'),
  validate(ctrl.createLeaveTypeSchema),
  asyncHandler(ctrl.createLeaveType),
);
router.get('/types/:id', requirePermission('leaves.view'), asyncHandler(ctrl.getLeaveType));
router.patch(
  '/types/:id',
  requirePermission('leaves.update'),
  validate(ctrl.updateLeaveTypeSchema),
  asyncHandler(ctrl.updateLeaveType),
);
router.delete(
  '/types/:id',
  requirePermission('leaves.delete'),
  asyncHandler(ctrl.deleteLeaveType),
);

// ---------- Leave Balances ----------
router.get(
  '/balances/my',
  requirePermission('leaves.view'),
  asyncHandler(ctrl.myLeaveBalances),
);
router.post(
  '/balances/allocate',
  requirePermission('leaves.update'),
  validate(ctrl.allocateBalanceSchema),
  asyncHandler(ctrl.allocateLeaveBalances),
);
router.patch(
  '/balances/:id/adjust',
  requirePermission('leaves.update'),
  validate(ctrl.adjustBalanceSchema),
  asyncHandler(ctrl.adjustLeaveBalance),
);
router.get(
  '/balances',
  requirePermission('leaves.view'),
  validate(ctrl.balanceQuerySchema, 'query'),
  asyncHandler(ctrl.listLeaveBalances),
);

// ---------- Reports ----------
router.get('/reports', requirePermission('leaves.view'), asyncHandler(ctrl.leaveReports));

// ---------- Leave Requests ----------
router.get('/requests/my', requirePermission('leaves.view'), asyncHandler(ctrl.myLeaveRequests));
router.get('/requests/team', requirePermission('leaves.view'), asyncHandler(ctrl.teamLeaveRequests));
router.get('/requests/calendar', requirePermission('leaves.view'), asyncHandler(ctrl.leaveCalendar));
router.get(
  '/requests',
  requirePermission('leaves.view'),
  validate(ctrl.leaveRequestQuerySchema, 'query'),
  asyncHandler(ctrl.listLeaveRequests),
);
router.post(
  '/requests',
  requirePermission('leaves.create'),
  validate(ctrl.createLeaveRequestSchema),
  asyncHandler(ctrl.applyLeave),
);
router.get('/requests/:id', requirePermission('leaves.view'), asyncHandler(ctrl.getLeaveRequest));
router.patch(
  '/requests/:id/approve',
  requirePermission('leaves.approve'),
  asyncHandler(ctrl.approveLeaveRequest),
);
router.patch(
  '/requests/:id/reject',
  requirePermission('leaves.approve'),
  validate(ctrl.rejectLeaveSchema),
  asyncHandler(ctrl.rejectLeaveRequest),
);
router.patch(
  '/requests/:id/cancel',
  requirePermission('leaves.update'),
  asyncHandler(ctrl.cancelLeaveRequest),
);

export default router;
