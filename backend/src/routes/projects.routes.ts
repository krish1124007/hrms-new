import { Router } from 'express';
import * as projCtrl from '../controllers/projects.controller.js';
import * as msCtrl from '../controllers/milestones.controller.js';
import * as taskCtrl from '../controllers/tasks.controller.js';
import * as teCtrl from '../controllers/time-entries.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

const router = Router();
router.use(authMiddleware);

/* ── Projects ── */
router.get(
  '/',
  requirePermission('projects.view'),
  validate(projCtrl.listQuerySchema, 'query'),
  asyncHandler(projCtrl.listProjects),
);
router.post(
  '/',
  requirePermission('projects.create'),
  validate(projCtrl.createProjectSchema),
  asyncHandler(projCtrl.createProject),
);
router.get('/:id', requirePermission('projects.view'), asyncHandler(projCtrl.getProject));
router.patch(
  '/:id',
  requirePermission('projects.update'),
  validate(projCtrl.updateProjectSchema),
  asyncHandler(projCtrl.updateProject),
);
router.delete('/:id', requirePermission('projects.delete'), asyncHandler(projCtrl.deleteProject));
router.get('/:id/dashboard', requirePermission('projects.view'), asyncHandler(projCtrl.getProjectDashboard));

/* ── Members ── */
router.post(
  '/:id/members',
  requirePermission('projects.update'),
  validate(projCtrl.memberSchema),
  asyncHandler(projCtrl.addMember),
);
router.delete(
  '/:id/members/:userId',
  requirePermission('projects.update'),
  asyncHandler(projCtrl.removeMember),
);

/* ── Milestones ── */
router.get(
  '/:projectId/milestones',
  requirePermission('projects.view'),
  asyncHandler(msCtrl.listMilestones),
);
router.post(
  '/:projectId/milestones',
  requirePermission('projects.update'),
  validate(msCtrl.createMilestoneSchema),
  asyncHandler(msCtrl.createMilestone),
);
router.patch(
  '/:projectId/milestones/:id',
  requirePermission('projects.update'),
  validate(msCtrl.updateMilestoneSchema),
  asyncHandler(msCtrl.updateMilestone),
);
router.delete(
  '/:projectId/milestones/:id',
  requirePermission('projects.update'),
  asyncHandler(msCtrl.deleteMilestone),
);

/* ── Tasks (Kanban) ── */
router.get(
  '/:projectId/tasks',
  requirePermission('projects.view'),
  asyncHandler(taskCtrl.listTasks),
);
router.post(
  '/:projectId/tasks',
  requirePermission('projects.update'),
  validate(taskCtrl.createTaskSchema),
  asyncHandler(taskCtrl.createTask),
);
router.patch(
  '/:projectId/tasks/reorder',
  requirePermission('projects.update'),
  validate(taskCtrl.reorderSchema),
  asyncHandler(taskCtrl.reorderTasks),
);
router.get(
  '/:projectId/tasks/:id',
  requirePermission('projects.view'),
  asyncHandler(taskCtrl.getTask),
);
router.patch(
  '/:projectId/tasks/:id',
  requirePermission('projects.update'),
  validate(taskCtrl.updateTaskSchema),
  asyncHandler(taskCtrl.updateTask),
);
router.patch(
  '/:projectId/tasks/:id/status',
  requirePermission('projects.update'),
  validate(taskCtrl.updateStatusSchema),
  asyncHandler(taskCtrl.updateTaskStatus),
);
router.delete(
  '/:projectId/tasks/:id',
  requirePermission('projects.update'),
  asyncHandler(taskCtrl.deleteTask),
);

/* ── Time entries ── */
router.get(
  '/:projectId/time-entries',
  requirePermission('projects.view'),
  asyncHandler(teCtrl.listTimeEntries),
);
router.get(
  '/:projectId/time-entries/summary',
  requirePermission('projects.view'),
  asyncHandler(teCtrl.getTimeEntrySummary),
);
router.post(
  '/:projectId/time-entries',
  requirePermission('projects.update'),
  validate(teCtrl.createTimeEntrySchema),
  asyncHandler(teCtrl.createTimeEntry),
);
router.patch(
  '/:projectId/time-entries/:id',
  requirePermission('projects.update'),
  validate(teCtrl.updateTimeEntrySchema),
  asyncHandler(teCtrl.updateTimeEntry),
);
router.delete(
  '/:projectId/time-entries/:id',
  requirePermission('projects.update'),
  asyncHandler(teCtrl.deleteTimeEntry),
);

export default router;
