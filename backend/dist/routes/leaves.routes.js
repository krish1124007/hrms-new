import { Router } from 'express';
import * as ctrl from '../controllers/leaves.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
// ---------- Leave Types ----------
router.get('/types', requirePermission('leaves.view'), validate(ctrl.leaveTypeQuerySchema, 'query'), asyncHandler(ctrl.listLeaveTypes));
// Leave types are company-wide configuration; `leaves.create` only lets an
// employee apply for their own leave.
router.post('/types', requirePermission('leaves.update'), validate(ctrl.createLeaveTypeSchema), asyncHandler(ctrl.createLeaveType));
router.get('/types/:id', requirePermission('leaves.view'), asyncHandler(ctrl.getLeaveType));
router.patch('/types/:id', requirePermission('leaves.update'), validate(ctrl.updateLeaveTypeSchema), asyncHandler(ctrl.updateLeaveType));
router.delete('/types/:id', requirePermission('leaves.delete'), asyncHandler(ctrl.deleteLeaveType));
// ---------- Leave Balances ----------
router.get('/balances/my', requirePermission('leaves.view'), asyncHandler(ctrl.myLeaveBalances));
router.post('/balances/allocate', requirePermission('leaves.update'), validate(ctrl.allocateBalanceSchema), asyncHandler(ctrl.allocateLeaveBalances));
router.post('/balances/open-year', requirePermission('leaves.update'), validate(ctrl.openYearSchema), asyncHandler(ctrl.openLeaveYearBalances));
router.patch('/balances/:id/adjust', requirePermission('leaves.update'), validate(ctrl.adjustBalanceSchema), asyncHandler(ctrl.adjustLeaveBalance));
router.post('/balances/reset', requirePermission('leaves.update'), validate(ctrl.resetBalanceSchema), asyncHandler(ctrl.resetLeaveBalances));
router.get('/balances', requirePermission('leaves.view'), validate(ctrl.balanceQuerySchema, 'query'), asyncHandler(ctrl.listLeaveBalances));
// ---------- Reports ----------
// Approvers only, scoped like the leave lists: a manager's reports cover their
// direct reports and themselves, HR (`leaves.approve_all` / `leaves.update`) everybody.
router.get('/reports', requirePermission('leaves.approve'), asyncHandler(ctrl.leaveReports));
// ---------- Leave Requests ----------
router.get('/requests/my', requirePermission('leaves.view'), asyncHandler(ctrl.myLeaveRequests));
router.get('/requests/team', requirePermission('leaves.view'), asyncHandler(ctrl.teamLeaveRequests));
router.get('/requests/calendar', requirePermission('leaves.view'), asyncHandler(ctrl.leaveCalendar));
router.get('/requests', requirePermission('leaves.view'), validate(ctrl.leaveRequestQuerySchema, 'query'), asyncHandler(ctrl.listLeaveRequests));
router.post('/requests', requirePermission('leaves.create'), validate(ctrl.createLeaveRequestSchema), asyncHandler(ctrl.applyLeave));
router.get('/requests/:id', requirePermission('leaves.view'), asyncHandler(ctrl.getLeaveRequest));
router.patch('/requests/:id/approve', requirePermission('leaves.approve'), asyncHandler(ctrl.approveLeaveRequest));
router.patch('/requests/:id/reject', requirePermission('leaves.approve'), validate(ctrl.rejectLeaveSchema), asyncHandler(ctrl.rejectLeaveRequest));
// Owner or `leaves.update` — checked per record in the controller.
router.patch('/requests/:id/cancel', validate(ctrl.cancelLeaveSchema), asyncHandler(ctrl.cancelLeaveRequest));
router.delete('/requests/:id', requirePermission('leaves.delete'), asyncHandler(ctrl.deleteLeaveRequest));
export default router;
//# sourceMappingURL=leaves.routes.js.map