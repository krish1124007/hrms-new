import { Router } from 'express';
import * as ctrl from '../controllers/shifts.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// Personal roster — every authenticated employee sees their own roster
// without needing `shifts.view`. Must be declared above `/:id` so the
// catch-all doesn't swallow it.
router.get(
  '/my-roster',
  validate(ctrl.rosterQuerySchema, 'query'),
  asyncHandler(ctrl.myRoster),
);

// Manager team roster — gated by shifts.view; respects reportingManager
// chain unless `departmentId` narrows it.
router.get(
  '/team-roster',
  requirePermission('shifts.view'),
  validate(ctrl.rosterQuerySchema, 'query'),
  asyncHandler(ctrl.teamRoster),
);

// Swap request stub — persists an audit entry until a real
// ShiftSwap model lands.
router.post(
  '/swap-request',
  validate(ctrl.swapRequestSchema),
  asyncHandler(ctrl.requestSwap),
);

router.get(
  '/',
  requirePermission('shifts.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.listShifts),
);
router.post(
  '/',
  requirePermission('shifts.create'),
  validate(ctrl.createShiftSchema),
  asyncHandler(ctrl.createShift),
);
router.get('/:id', requirePermission('shifts.view'), asyncHandler(ctrl.getShift));
router.patch(
  '/:id',
  requirePermission('shifts.update'),
  validate(ctrl.updateShiftSchema),
  asyncHandler(ctrl.updateShift),
);
router.delete('/:id', requirePermission('shifts.delete'), asyncHandler(ctrl.deleteShift));
router.post(
  '/:id/assign',
  requirePermission('shifts.update'),
  validate(ctrl.assignShiftSchema),
  asyncHandler(ctrl.assignShift),
);

export default router;
