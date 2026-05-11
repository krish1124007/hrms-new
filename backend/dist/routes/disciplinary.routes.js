import { Router } from 'express';
import * as ctrl from '../controllers/disciplinary.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/me', asyncHandler(ctrl.myActions));
router.get('/', requirePermission('disciplinary.view'), validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/stats', requirePermission('disciplinary.view'), asyncHandler(ctrl.stats));
router.post('/', requirePermission('disciplinary.manage'), validate(ctrl.createSchema), asyncHandler(ctrl.create));
// No requirePermission here — the controller does an ownership check so
// employees can view their own case while still blocking everyone else's.
router.get('/:id', asyncHandler(ctrl.get));
router.patch('/:id', requirePermission('disciplinary.manage'), validate(ctrl.updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('disciplinary.manage'), asyncHandler(ctrl.remove));
router.post('/:id/acknowledge', requirePermission('disciplinary.view'), validate(ctrl.acknowledgeSchema), asyncHandler(ctrl.acknowledge));
router.post('/:id/resolve', requirePermission('disciplinary.manage'), validate(ctrl.resolveSchema), asyncHandler(ctrl.resolve));
router.post('/:id/escalate', requirePermission('disciplinary.manage'), validate(ctrl.escalateSchema), asyncHandler(ctrl.escalate));
router.post('/:id/cancel', requirePermission('disciplinary.manage'), validate(ctrl.cancelSchema), asyncHandler(ctrl.cancel));
router.post('/:id/comments', requirePermission('disciplinary.manage'), validate(ctrl.addCommentSchema), asyncHandler(ctrl.addComment));
router.post('/:id/attachments', requirePermission('disciplinary.manage'), validate(ctrl.addAttachmentSchema), asyncHandler(ctrl.addAttachment));
router.delete('/:id/attachments/:attId', requirePermission('disciplinary.manage'), asyncHandler(ctrl.removeAttachment));
export default router;
//# sourceMappingURL=disciplinary.routes.js.map