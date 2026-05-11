import { Router } from 'express';
import * as ctrl from '../controllers/search.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { cacheFor } from '../middleware/http-cache.middleware.js';
const router = Router();
router.use(authMiddleware);
// Cmd+K gets hit on every keystroke — 10s cache shaves a lot of Meili load
// and the staleness is imperceptible to the user.
router.get('/', cacheFor('10s'), validate(ctrl.searchQuerySchema, 'query'), asyncHandler(ctrl.globalSearch));
export default router;
//# sourceMappingURL=search.routes.js.map