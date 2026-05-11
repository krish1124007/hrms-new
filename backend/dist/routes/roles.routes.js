import { Router } from 'express';
import * as ctrl from '../controllers/roles.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', requirePermission('roles.view'), asyncHandler(ctrl.listRoles));
router.post('/', requirePermission('roles.create'), validate(ctrl.createRoleSchema), asyncHandler(ctrl.createRole));
router.get('/:id', requirePermission('roles.view'), asyncHandler(ctrl.getRole));
router.patch('/:id', requirePermission('roles.update'), validate(ctrl.updateRoleSchema), asyncHandler(ctrl.updateRole));
router.delete('/:id', requirePermission('roles.delete'), asyncHandler(ctrl.deleteRole));
export default router;
//# sourceMappingURL=roles.routes.js.map