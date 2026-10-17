import { Router } from 'express';
import * as ctrl from '../controllers/notice.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
// Reading and acknowledging are for everyone; notices themselves are
// company-wide announcements, so only `notices.manage` may write them.
const manage = requirePermission('notices.manage');
router.get('/', validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listNotices));
router.post('/', manage, validate(ctrl.createNoticeSchema), asyncHandler(ctrl.createNotice));
router.get('/:id', asyncHandler(ctrl.getNotice));
router.patch('/:id', manage, validate(ctrl.updateNoticeSchema), asyncHandler(ctrl.updateNotice));
router.delete('/:id', manage, asyncHandler(ctrl.deleteNotice));
router.post('/:id/acknowledge', asyncHandler(ctrl.acknowledgeNotice));
export default router;
//# sourceMappingURL=notice.routes.js.map