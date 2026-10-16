import { Router } from 'express';
import * as ctrl from '../controllers/holidays.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get(
  '/',
  requirePermission('holidays.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.listHolidays),
);
router.get('/upcoming', requirePermission('holidays.view'), asyncHandler(ctrl.upcomingHolidays));
router.post(
  '/',
  requirePermission('holidays.create'),
  validate(ctrl.createHolidaySchema),
  asyncHandler(ctrl.createHoliday),
);
router.post(
  '/import-calendar',
  requirePermission('holidays.create'),
  validate(ctrl.importCalendarSchema),
  asyncHandler(ctrl.importCalendar),
);
router.get('/:id', requirePermission('holidays.view'), asyncHandler(ctrl.getHoliday));
router.patch(
  '/:id',
  requirePermission('holidays.update'),
  validate(ctrl.updateHolidaySchema),
  asyncHandler(ctrl.updateHoliday),
);
router.delete('/:id', requirePermission('holidays.delete'), asyncHandler(ctrl.deleteHoliday));

export default router;
