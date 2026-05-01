import { Router } from 'express';
import * as ctrl from '../controllers/id-card.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get('/templates', asyncHandler(ctrl.listTemplates));
router.post('/templates', validate(ctrl.createTemplateSchema), asyncHandler(ctrl.createTemplate));
router.patch('/templates/:id', validate(ctrl.updateTemplateSchema), asyncHandler(ctrl.updateTemplate));
router.get('/generate/:employeeId', asyncHandler(ctrl.generateIdCard));

export default router;
