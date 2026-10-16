import { Router } from 'express';
import * as ctrl from '../controllers/loans.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get('/me', asyncHandler(ctrl.myLoans));

router.get(
  '/',
  requirePermission('loans.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.listLoans),
);
router.get('/stats', requirePermission('loans.view'), asyncHandler(ctrl.loanStats));
router.post(
  '/preview-emi',
  requirePermission('loans.view'),
  validate(ctrl.previewEmiSchema),
  asyncHandler(ctrl.previewEmi),
);
router.post(
  '/',
  requirePermission('loans.manage'),
  validate(ctrl.createLoanSchema),
  asyncHandler(ctrl.createLoan),
);
router.get('/:id', requirePermission('loans.view'), asyncHandler(ctrl.getLoan));
router.patch(
  '/:id',
  requirePermission('loans.manage'),
  validate(ctrl.updateLoanSchema),
  asyncHandler(ctrl.updateLoan),
);
router.delete('/:id', requirePermission('loans.manage'), asyncHandler(ctrl.deleteLoan));
router.post(
  '/:id/approve',
  requirePermission('loans.approve'),
  validate(ctrl.approveLoanSchema),
  asyncHandler(ctrl.approveLoan),
);
router.post(
  '/:id/reject',
  requirePermission('loans.approve'),
  validate(ctrl.rejectLoanSchema),
  asyncHandler(ctrl.rejectLoan),
);
router.post(
  '/:id/disburse',
  requirePermission('loans.manage'),
  validate(ctrl.disburseLoanSchema),
  asyncHandler(ctrl.disburseLoan),
);
router.post(
  '/:id/payments',
  requirePermission('loans.manage'),
  validate(ctrl.recordPaymentSchema),
  asyncHandler(ctrl.recordPayment),
);

export default router;
