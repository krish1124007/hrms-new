import { Router } from 'express';
import * as ctrl from '../controllers/audit-log.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { cacheFor } from '../middleware/http-cache.middleware.js';

const router = Router();
router.use(authMiddleware);

router.get('/', requirePermission('audit.view'), asyncHandler(ctrl.listAuditLogs));
router.get(
  '/entities',
  requirePermission('audit.view'),
  cacheFor('5m'),
  asyncHandler(ctrl.listAuditEntities),
);
router.get('/:id', requirePermission('audit.view'), asyncHandler(ctrl.getAuditLog));

export default router;
