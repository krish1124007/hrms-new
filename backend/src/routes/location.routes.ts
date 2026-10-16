import { Router } from 'express';
import * as ctrl from '../controllers/location.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

router.get('/', asyncHandler(ctrl.listLocations));
router.post('/', validate(ctrl.createLocationSchema), asyncHandler(ctrl.createLocation));
router.get('/:id', asyncHandler(ctrl.getLocation));
router.patch('/:id', validate(ctrl.updateLocationSchema), asyncHandler(ctrl.updateLocation));
router.delete('/:id', asyncHandler(ctrl.deleteLocation));
router.post('/:id/employees', validate(ctrl.assignEmployeesSchema), asyncHandler(ctrl.assignEmployees));

export default router;
