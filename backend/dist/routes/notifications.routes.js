import { Router } from 'express';
import * as ctrl from '../controllers/notification.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.listNotifications));
router.get('/unread-count', asyncHandler(ctrl.getUnreadCount));
router.post('/mark-all-read', asyncHandler(ctrl.markAllRead));
// Mobile push-device registration (FCM/APNs tokens)
router.post('/devices', validate(ctrl.registerDeviceSchema), asyncHandler(ctrl.registerDevice));
router.delete('/devices/:token', asyncHandler(ctrl.unregisterDevice));
router.post('/:id/read', asyncHandler(ctrl.markRead));
router.delete('/:id', asyncHandler(ctrl.deleteNotification));
export default router;
//# sourceMappingURL=notifications.routes.js.map