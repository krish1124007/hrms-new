import { Router } from 'express';
import * as ctrl from '../controllers/notice.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listNotices));
router.post('/', validate(ctrl.createNoticeSchema), asyncHandler(ctrl.createNotice));
router.get('/:id', asyncHandler(ctrl.getNotice));
router.patch('/:id', validate(ctrl.updateNoticeSchema), asyncHandler(ctrl.updateNotice));
router.delete('/:id', asyncHandler(ctrl.deleteNotice));
router.post('/:id/acknowledge', asyncHandler(ctrl.acknowledgeNotice));
export default router;
//# sourceMappingURL=notice.routes.js.map