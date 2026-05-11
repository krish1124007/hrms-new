import { Router } from 'express';
import * as ctrl from '../controllers/assets.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/me', asyncHandler(ctrl.myAssets));
router.get('/', requirePermission('assets.view'), validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listAssets));
router.get('/stats', requirePermission('assets.view'), asyncHandler(ctrl.assetStats));
router.post('/', requirePermission('assets.manage'), validate(ctrl.createAssetSchema), asyncHandler(ctrl.createAsset));
router.get('/:id', requirePermission('assets.view'), asyncHandler(ctrl.getAsset));
router.patch('/:id', requirePermission('assets.manage'), validate(ctrl.updateAssetSchema), asyncHandler(ctrl.updateAsset));
router.delete('/:id', requirePermission('assets.manage'), asyncHandler(ctrl.deleteAsset));
router.post('/:id/assign', requirePermission('assets.manage'), validate(ctrl.assignSchema), asyncHandler(ctrl.assignAsset));
router.post('/:id/unassign', requirePermission('assets.manage'), validate(ctrl.unassignSchema), asyncHandler(ctrl.unassignAsset));
export default router;
//# sourceMappingURL=assets.routes.js.map