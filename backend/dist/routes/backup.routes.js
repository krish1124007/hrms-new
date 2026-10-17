import { Router } from 'express';
import * as ctrl from '../controllers/backup.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
const canView = requirePermission('backups.view');
const canManage = requirePermission('backups.manage');
router.get('/', canView, asyncHandler(ctrl.listBackups));
router.get('/schedule', canView, asyncHandler(ctrl.getSchedule));
router.put('/schedule', canManage, validate(ctrl.updateScheduleSchema), asyncHandler(ctrl.updateSchedule));
router.post('/', canManage, validate(ctrl.createBackupSchema), asyncHandler(ctrl.createBackup));
router.post('/:id/restore', canManage, validate(ctrl.restoreBackupSchema), asyncHandler(ctrl.restoreBackup));
router.get('/:id/download', canManage, asyncHandler(ctrl.downloadBackup));
router.delete('/:id', canManage, asyncHandler(ctrl.deleteBackup));
export default router;
//# sourceMappingURL=backup.routes.js.map