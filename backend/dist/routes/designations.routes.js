import { Router } from 'express';
import * as ctrl from '../controllers/designations.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', requirePermission('designations.view'), validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listDesignations));
router.post('/', requirePermission('designations.create'), validate(ctrl.createDesignationSchema), asyncHandler(ctrl.createDesignation));
router.get('/:id', requirePermission('designations.view'), asyncHandler(ctrl.getDesignation));
router.patch('/:id', requirePermission('designations.update'), validate(ctrl.updateDesignationSchema), asyncHandler(ctrl.updateDesignation));
router.delete('/:id', requirePermission('designations.delete'), asyncHandler(ctrl.deleteDesignation));
export default router;
//# sourceMappingURL=designations.routes.js.map