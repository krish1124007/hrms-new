import { Router } from 'express';
import * as teCtrl from '../controllers/time-entries.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
router.get('/my', asyncHandler(teCtrl.myTimesheets));
router.get('/weekly', asyncHandler(teCtrl.weeklyTimesheet));
export default router;
//# sourceMappingURL=timesheets.routes.js.map