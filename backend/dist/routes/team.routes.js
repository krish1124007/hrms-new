import { Router } from 'express';
import * as ctrl from '../controllers/team.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
/**
 * GET /api/v1/team/overview
 *
 * Manager dashboard envelope. No special permission gate — every
 * authenticated user gets *their own* direct-report aggregate. Users with
 * no reports get an empty payload (handled in the controller) so the
 * mobile screen still renders cleanly.
 */
router.get('/overview', asyncHandler(ctrl.teamOverview));
export default router;
//# sourceMappingURL=team.routes.js.map