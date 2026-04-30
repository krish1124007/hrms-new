import { Router } from 'express';
import * as ctrl from '../controllers/backup.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(ctrl.listBackups));
router.get('/schedule', asyncHandler(ctrl.getSchedule));
router.put(
  '/schedule',
  validate(ctrl.updateScheduleSchema),
  asyncHandler(ctrl.updateSchedule),
);
router.post('/', validate(ctrl.createBackupSchema), asyncHandler(ctrl.createBackup));
router.post(
  '/:id/restore',
  validate(ctrl.restoreBackupSchema),
  asyncHandler(ctrl.restoreBackup),
);
router.delete('/:id', asyncHandler(ctrl.deleteBackup));

export default router;
