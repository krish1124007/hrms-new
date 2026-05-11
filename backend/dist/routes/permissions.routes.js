import { Router } from 'express';
import * as ctrl from '../controllers/roles.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/', asyncHandler(ctrl.listPermissions));
export default router;
//# sourceMappingURL=permissions.routes.js.map