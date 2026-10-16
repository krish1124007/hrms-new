import { Router } from 'express';
import * as ctrl from '../controllers/overtime.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// Self-service: every authenticated user sees their own requests.
router.get('/me', asyncHandler(ctrl.listMine));

router.get(
  '/',
  requirePermission('overtime.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.list),
);
router.get('/stats', requirePermission('overtime.view'), asyncHandler(ctrl.stats));
router.post('/', validate(ctrl.createSchema), asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', validate(ctrl.updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));

router.post(
  '/:id/approve',
  requirePermission('overtime.approve'),
  validate(ctrl.approveSchema),
  asyncHandler(ctrl.approve),
);
router.post(
  '/:id/reject',
  requirePermission('overtime.approve'),
  validate(ctrl.rejectSchema),
  asyncHandler(ctrl.reject),
);

export default router;
