import { Router } from 'express';
import * as ctrl from '../controllers/departments.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', requirePermission('departments.view'), validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listDepartments));
router.get('/tree', requirePermission('departments.view'), asyncHandler(ctrl.getDepartmentTree));
router.post('/', requirePermission('departments.create'), validate(ctrl.createDepartmentSchema), asyncHandler(ctrl.createDepartment));
router.get('/:id', requirePermission('departments.view'), asyncHandler(ctrl.getDepartment));
router.patch('/:id', requirePermission('departments.update'), validate(ctrl.updateDepartmentSchema), asyncHandler(ctrl.updateDepartment));
router.delete('/:id', requirePermission('departments.delete'), asyncHandler(ctrl.deleteDepartment));
export default router;
//# sourceMappingURL=departments.routes.js.map