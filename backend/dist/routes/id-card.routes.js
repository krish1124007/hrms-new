import { Router } from 'express';
import * as ctrl from '../controllers/id-card.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
/**
 * PUBLIC — what a QR scan opens. Registered before `authMiddleware` on
 * purpose: a guard or visitor scanning a card is not logged in. The code is
 * HMAC-signed, and the response is a fixed, minimal set of fields.
 */
router.get('/verify/:code', asyncHandler(ctrl.verifyIdCard));
router.use(authMiddleware);
/**
 * Self-service — every employee gets their own card and only their own. The
 * route takes no id, so it cannot be pointed at somebody else.
 */
router.get('/my', asyncHandler(ctrl.myIdCard));
/* ── HR-only below ──
 * These were open to any authenticated user: anybody could rewrite the card
 * templates, and /generate/:employeeId was designed to hand back another
 * employee's full record. Card data is HR territory, so it is gated now.
 */
router.get('/templates', requirePermission('employees.view'), asyncHandler(ctrl.listTemplates));
router.post('/templates', requirePermission('employees.update'), validate(ctrl.createTemplateSchema), asyncHandler(ctrl.createTemplate));
router.patch('/templates/:id', requirePermission('employees.update'), validate(ctrl.updateTemplateSchema), asyncHandler(ctrl.updateTemplate));
router.get('/generate/:employeeId', requirePermission('employees.view'), asyncHandler(ctrl.generateIdCard));
export default router;
//# sourceMappingURL=id-card.routes.js.map