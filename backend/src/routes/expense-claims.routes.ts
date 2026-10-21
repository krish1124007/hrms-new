import { Router } from 'express';
import * as ctrl from '../controllers/expense-claims.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// ---------- Categories ----------
// Everyone filing a claim reads the list; the categories themselves (names,
// limits, receipt rules) are company-wide configuration, written only with
// `expenses.config` (HR). Employees hold expenses.create/update/delete for
// their *own claims*, and a manager's expenses.approve is for deciding their
// reports' claims — neither reaches the categories.
router.get(
  '/categories',
  requirePermission('expenses.view'),
  validate(ctrl.categoryQuerySchema, 'query'),
  asyncHandler(ctrl.listCategories),
);
router.post(
  '/categories',
  requirePermission('expenses.config'),
  validate(ctrl.createCategorySchema),
  asyncHandler(ctrl.createCategory),
);
router.get(
  '/categories/:id',
  requirePermission('expenses.view'),
  asyncHandler(ctrl.getCategory),
);
router.patch(
  '/categories/:id',
  requirePermission('expenses.config'),
  validate(ctrl.updateCategorySchema),
  asyncHandler(ctrl.updateCategory),
);
router.delete(
  '/categories/:id',
  requirePermission('expenses.config'),
  asyncHandler(ctrl.deleteCategory),
);

// ---------- Reports ----------
// Approvers only, scoped like the claim lists: a manager's reports cover their
// direct reports and themselves, `expenses.approve_all` everybody.
router.get('/reports', requirePermission('expenses.approve'), asyncHandler(ctrl.expenseReports));

// ---------- Claims ----------
router.get('/requests/my', requirePermission('expenses.view'), asyncHandler(ctrl.myClaims));
router.get('/requests/team', requirePermission('expenses.view'), asyncHandler(ctrl.teamClaims));
router.get(
  '/requests',
  requirePermission('expenses.view'),
  validate(ctrl.claimQuerySchema, 'query'),
  asyncHandler(ctrl.listClaims),
);
router.post(
  '/requests',
  requirePermission('expenses.create'),
  validate(ctrl.createClaimSchema),
  asyncHandler(ctrl.createClaim),
);
router.get('/requests/:id', requirePermission('expenses.view'), asyncHandler(ctrl.getClaim));
router.patch(
  '/requests/:id',
  requirePermission('expenses.update'),
  validate(ctrl.updateClaimSchema),
  asyncHandler(ctrl.updateClaim),
);
router.delete(
  '/requests/:id',
  requirePermission('expenses.delete'),
  asyncHandler(ctrl.deleteClaim),
);
router.patch(
  '/requests/:id/approve',
  requirePermission('expenses.approve'),
  validate(ctrl.approveClaimSchema),
  asyncHandler(ctrl.approveClaim),
);
router.patch(
  '/requests/:id/reject',
  requirePermission('expenses.approve'),
  validate(ctrl.rejectClaimSchema),
  asyncHandler(ctrl.rejectClaim),
);
router.patch(
  '/requests/:id/reimburse',
  requirePermission('expenses.approve'),
  validate(ctrl.reimburseClaimSchema),
  asyncHandler(ctrl.reimburseClaim),
);

export default router;
