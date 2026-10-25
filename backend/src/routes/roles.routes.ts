import { Router } from 'express';
import * as ctrl from '../controllers/roles.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requireAnyPermission, requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get('/', requirePermission('roles.view'), asyncHandler(ctrl.listRoles));
// The role picker of whoever may give a login a role: inviting or editing a
// user, or onboarding an employee (whose login gets a role). Before `/:id`.
router.get(
  '/assignable',
  requireAnyPermission('roles.view', 'users.create', 'users.update', 'employees.create'),
  asyncHandler(ctrl.listAssignableRoles),
);
router.post(
  '/',
  requirePermission('roles.create'),
  validate(ctrl.createRoleSchema),
  asyncHandler(ctrl.createRole),
);
router.get('/:id', requirePermission('roles.view'), asyncHandler(ctrl.getRole));
router.patch(
  '/:id',
  requirePermission('roles.update'),
  validate(ctrl.updateRoleSchema),
  asyncHandler(ctrl.updateRole),
);
router.delete('/:id', requirePermission('roles.delete'), asyncHandler(ctrl.deleteRole));

export default router;
