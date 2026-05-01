import { Router } from 'express';
import * as ctrl from '../controllers/users.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get(
  '/',
  requirePermission('users.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.listUsers),
);
router.post(
  '/',
  requirePermission('users.create'),
  validate(ctrl.inviteUserSchema),
  asyncHandler(ctrl.inviteUser),
);
router.get('/:id', requirePermission('users.view'), asyncHandler(ctrl.getUser));
router.patch(
  '/:id',
  requirePermission('users.update'),
  validate(ctrl.updateUserSchema),
  asyncHandler(ctrl.updateUser),
);
router.delete('/:id', requirePermission('users.delete'), asyncHandler(ctrl.deleteUser));
router.patch(
  '/:id/status',
  requirePermission('users.update'),
  validate(ctrl.updateStatusSchema),
  asyncHandler(ctrl.updateUserStatus),
);
router.patch(
  '/:id/password',
  requirePermission('users.update'),
  validate(ctrl.setPasswordSchema),
  asyncHandler(ctrl.setUserPassword),
);

export default router;
