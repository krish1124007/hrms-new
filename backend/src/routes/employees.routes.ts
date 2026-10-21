import { Router } from 'express';
import * as ctrl from '../controllers/employees.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

// ---------- Self-service: any logged-in user ----------
// Declared before `/:id` so "me" and "directory" are never read as an id.
// Own profile (no salary / bank); a user without an employee record gets 404
// NO_EMPLOYEE_PROFILE.
router.get('/me', asyncHandler(ctrl.getMyProfile));
router.patch('/me', validate(ctrl.updateSelfSchema), asyncHandler(ctrl.updateMyProfile));
// Colleagues still employed — work contact details only.
router.get(
  '/directory',
  validate(ctrl.directoryQuerySchema, 'query'),
  asyncHandler(ctrl.listDirectory),
);
router.get('/directory/stats', asyncHandler(ctrl.directoryStats));
router.get('/directory/:id', asyncHandler(ctrl.getDirectoryEntry));

// ---------- HR ----------
router.get(
  '/',
  requirePermission('employees.view'),
  validate(ctrl.listQuerySchema, 'query'),
  asyncHandler(ctrl.listEmployees),
);
router.get('/stats', requirePermission('employees.view'), asyncHandler(ctrl.employeeStats));
router.get('/birthdays', requirePermission('employees.view'), asyncHandler(ctrl.upcomingBirthdays));
router.get('/export', requirePermission('employees.view'), asyncHandler(ctrl.exportEmployees));
router.post(
  '/import',
  requirePermission('employees.create'),
  validate(ctrl.importEmployeesSchema),
  asyncHandler(ctrl.importEmployees),
);
router.post(
  '/',
  requirePermission('employees.create'),
  validate(ctrl.createEmployeeSchema),
  asyncHandler(ctrl.createEmployee),
);
router.get('/:id', requirePermission('employees.view'), asyncHandler(ctrl.getEmployee));
router.patch(
  '/:id',
  requirePermission('employees.update'),
  validate(ctrl.updateEmployeeSchema),
  asyncHandler(ctrl.updateEmployee),
);
router.delete('/:id', requirePermission('employees.delete'), asyncHandler(ctrl.deleteEmployee));
// Undoing a delete takes the permission that deletes.
router.post('/:id/restore', requirePermission('employees.delete'), asyncHandler(ctrl.restoreEmployee));
router.patch(
  '/:id/status',
  requirePermission('employees.update'),
  validate(ctrl.updateStatusSchema),
  asyncHandler(ctrl.updateEmployeeStatus),
);
router.post(
  '/:id/documents',
  requirePermission('employees.update'),
  validate(ctrl.addDocumentSchema),
  asyncHandler(ctrl.addEmployeeDocument),
);
router.delete(
  '/:id/documents/:docId',
  requirePermission('employees.update'),
  asyncHandler(ctrl.deleteEmployeeDocument),
);

export default router;
