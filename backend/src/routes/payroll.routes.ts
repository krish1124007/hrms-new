import { Router } from 'express';
import * as ctrl from '../controllers/payroll.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

/* ── Salary Components ── */
router.get(
  '/components',
  requirePermission('payroll.process'),
  validate(ctrl.componentQuerySchema, 'query'),
  asyncHandler(ctrl.listComponents),
);
router.post(
  '/components',
  requirePermission('payroll.config'),
  validate(ctrl.componentSchema),
  asyncHandler(ctrl.createComponent),
);
router.get(
  '/components/:id',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.getComponent),
);
router.patch(
  '/components/:id',
  requirePermission('payroll.config'),
  validate(ctrl.updateComponentSchema),
  asyncHandler(ctrl.updateComponent),
);
router.delete(
  '/components/:id',
  requirePermission('payroll.config'),
  asyncHandler(ctrl.deleteComponent),
);

/* ── Salary Structures ── */
router.get(
  '/structures',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.listStructures),
);
router.post(
  '/structures',
  requirePermission('payroll.config'),
  validate(ctrl.structureSchema),
  asyncHandler(ctrl.createStructure),
);
router.get(
  '/structures/:id',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.getStructure),
);
router.patch(
  '/structures/:id',
  requirePermission('payroll.config'),
  validate(ctrl.updateStructureSchema),
  asyncHandler(ctrl.updateStructure),
);
router.delete(
  '/structures/:id',
  requirePermission('payroll.config'),
  asyncHandler(ctrl.deleteStructure),
);
router.post(
  '/structures/:id/assign',
  requirePermission('payroll.config'),
  validate(ctrl.assignStructureSchema),
  asyncHandler(ctrl.assignStructure),
);

/* ── Self-service ── */
router.get('/my-payslips', requirePermission('payroll.view'), asyncHandler(ctrl.myPayslips));
router.get('/my-payslips/:id', requirePermission('payroll.view'), asyncHandler(ctrl.getRecord));

/* ── Reports ── */
router.get(
  '/reports/monthly',
  requirePermission('payroll.process'),
  validate(ctrl.monthlyReportQuery, 'query'),
  asyncHandler(ctrl.monthlyReport),
);
router.get(
  '/reports/yearly',
  requirePermission('payroll.process'),
  validate(ctrl.yearlyReportQuery, 'query'),
  asyncHandler(ctrl.yearlyReport),
);
router.get(
  '/reports/statutory',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.statutoryReport),
);

/* ── Cycles ── */
router.get(
  '/cycles',
  requirePermission('payroll.process'),
  validate(ctrl.cycleQuerySchema, 'query'),
  asyncHandler(ctrl.listCycles),
);
router.post(
  '/cycles',
  requirePermission('payroll.process'),
  validate(ctrl.createCycleSchema),
  asyncHandler(ctrl.createCycle),
);
router.get(
  '/cycles/:id',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.getCycle),
);
router.post(
  '/cycles/:id/process',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.processCycle),
);
router.get(
  '/cycles/:id/records',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.listCycleRecords),
);
router.patch(
  '/cycles/:id/records/:recordId',
  requirePermission('payroll.process'),
  validate(ctrl.updateRecordSchema),
  asyncHandler(ctrl.updateRecord),
);
router.post(
  '/cycles/:id/generate-payslips',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.generatePayslips),
);
router.post(
  '/cycles/:id/lock',
  requirePermission('payroll.process'),
  asyncHandler(ctrl.lockCycle),
);
router.post(
  '/cycles/:id/mark-paid',
  requirePermission('payroll.process'),
  validate(ctrl.markPaidSchema),
  asyncHandler(ctrl.markCyclePaid),
);

/* ── Records ── */
// `getRecord` returns the full payroll record (incl. salary). Employees who
// need their own data go through /my-payslips. Direct record fetch is HR-only.
router.get('/records/:id', requirePermission('payroll.process'), asyncHandler(ctrl.getRecord));
// Payslip download keeps `payroll.view` because the controller has its own
// ownership guard (employees can only download their own payslip).
router.get(
  '/records/:id/payslip',
  requirePermission('payroll.view'),
  asyncHandler(ctrl.downloadPayslip),
);

export default router;
