import { Router } from 'express';
import * as ctrl from '../controllers/location.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// Any signed-in user may read locations; changing them is `locations.manage`.
const manage = requirePermission('locations.manage');

router.get('/', asyncHandler(ctrl.listLocations));
router.post('/', manage, validate(ctrl.createLocationSchema), asyncHandler(ctrl.createLocation));
router.get('/:id', asyncHandler(ctrl.getLocation));
router.patch(
  '/:id',
  manage,
  validate(ctrl.updateLocationSchema),
  asyncHandler(ctrl.updateLocation),
);
router.delete('/:id', manage, asyncHandler(ctrl.deleteLocation));
router.post(
  '/:id/employees',
  manage,
  validate(ctrl.assignEmployeesSchema),
  asyncHandler(ctrl.assignEmployees),
);

export default router;
