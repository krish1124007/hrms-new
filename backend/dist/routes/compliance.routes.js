import { Router } from 'express';
import * as ctrl from '../controllers/compliance.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { TIGHT_JSON } from '../middleware/body-limit.middleware.js';
export const meRouter = Router();
meRouter.use(authMiddleware);
meRouter.post('/delete-account', TIGHT_JSON, validate(ctrl.deleteAccountSchema), asyncHandler(ctrl.deleteMyAccount));
meRouter.post('/consent', TIGHT_JSON, validate(ctrl.recordConsentSchema), asyncHandler(ctrl.recordConsent));
meRouter.get('/compliance', asyncHandler(ctrl.complianceStatus));
//# sourceMappingURL=compliance.routes.js.map