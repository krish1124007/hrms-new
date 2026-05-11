import { Router } from 'express';
import * as ctrl from '../controllers/admin.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.post('/test-email', requirePermission('settings.manage'), validate(ctrl.testEmailSchema), asyncHandler(ctrl.testEmail));
export default router;
//# sourceMappingURL=admin.routes.js.map