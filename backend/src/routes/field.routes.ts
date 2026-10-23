import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { rejectRawUploadRefs } from '../middleware/presign-response.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';

import * as settings from '../controllers/field-settings.controller.js';
import * as sites from '../controllers/field-sites.controller.js';
import * as visits from '../controllers/field-visits.controller.js';
import * as tasks from '../controllers/field-tasks.controller.js';
import * as tracking from '../controllers/field-tracking.controller.js';
import * as fieldMap from '../controllers/field-map.controller.js';
import * as uploads from '../controllers/field-uploads.controller.js';

const router = Router();
router.use(authMiddleware);

/*
 * Field Visits. `field.view`: the caller's own records and their direct
 * reports' (lib/field-scope.ts); `field.manage`: everybody's, plus settings,
 * site deletion and import. Record-level rules live in the controllers.
 */

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploads.MAX_PHOTO_BYTES, files: 1 },
  fileFilter: uploads.photoFileFilter,
});

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: uploads.MAX_DOCUMENT_BYTES, files: 1 },
  fileFilter: uploads.documentFileFilter,
});

const sheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: sites.sheetFileFilter,
});

/* ── Settings ── */
router.get('/settings', requirePermission('field.view'), asyncHandler(settings.getSettings));
router.put(
  '/settings',
  requirePermission('field.manage'),
  validate(settings.updateFieldSettingsSchema),
  asyncHandler(settings.putSettings),
);

/* ── Uploads ── */
router.post(
  '/uploads/photo',
  requirePermission('field.view'),
  photoUpload.single('photo'),
  uploads.photoUploadErrors,
  asyncHandler(uploads.uploadPhoto),
);
router.post(
  '/uploads/document',
  requirePermission('field.view'),
  documentUpload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'file', maxCount: 1 },
  ]),
  uploads.documentUploadErrors,
  asyncHandler(uploads.uploadDocument),
);

/* ── Sites ── */
router.get(
  '/sites/map',
  requirePermission('field.view'),
  validate(sites.mapQuerySchema, 'query'),
  asyncHandler(sites.sitesMap),
);
router.post(
  '/sites/import',
  requirePermission('field.manage'),
  sheetUpload.single('file'),
  sites.importUploadErrors,
  rejectRawUploadRefs,
  asyncHandler(sites.importSites),
);
router.get(
  '/sites',
  requirePermission('field.view'),
  validate(sites.listQuerySchema, 'query'),
  asyncHandler(sites.listSites),
);
router.post(
  '/sites',
  requirePermission('field.view'), // any field employee may pin; the site is assigned to them
  validate(sites.createSiteSchema),
  asyncHandler(sites.createSite),
);
router.get('/sites/:id', requirePermission('field.view'), asyncHandler(sites.getSite));
router.patch(
  '/sites/:id',
  requirePermission('field.view'), // the creator within 24 h, or field.manage (checked in the controller)
  validate(sites.updateSiteSchema),
  asyncHandler(sites.updateSite),
);
router.delete('/sites/:id', requirePermission('field.manage'), asyncHandler(sites.deleteSite));

/* ── Visits ── */
router.get(
  '/visits/today',
  requirePermission('field.view'),
  asyncHandler(visits.todayVisits),
);
router.get(
  '/visits/map',
  requirePermission('field.view'),
  validate(fieldMap.visitsMapQuerySchema, 'query'),
  asyncHandler(fieldMap.visitsMap),
);
router.get(
  '/visits/timeline/:employeeId',
  requirePermission('field.view'),
  asyncHandler(visits.visitTimeline),
);
router.post(
  '/visits/check-in',
  requirePermission('field.view'),
  validate(visits.checkInSchema),
  asyncHandler(visits.checkIn),
);
router.post(
  '/visits/:id/check-out',
  requirePermission('field.view'),
  validate(visits.checkOutSchema),
  asyncHandler(visits.checkOut),
);
router.get(
  '/visits',
  requirePermission('field.view'),
  validate(visits.listQuerySchema, 'query'),
  asyncHandler(visits.listVisits),
);
router.post(
  '/visits',
  requirePermission('field.view'),
  validate(visits.createVisitSchema),
  asyncHandler(visits.createVisit),
);
router.get(
  '/visits/:id',
  requirePermission('field.view'),
  asyncHandler(visits.getVisit),
);
router.patch(
  '/visits/:id',
  requirePermission('field.view'),
  validate(visits.updateVisitSchema),
  asyncHandler(visits.updateVisit),
);
router.delete(
  '/visits/:id',
  requirePermission('field.manage'),
  asyncHandler(visits.deleteVisit),
);

/* ── Tasks ── */
router.get(
  '/tasks/my',
  requirePermission('field.view'),
  validate(tasks.myQuerySchema, 'query'),
  asyncHandler(tasks.myTasks),
);
router.get(
  '/tasks/team',
  requirePermission('field.view'),
  validate(tasks.myQuerySchema, 'query'),
  asyncHandler(tasks.teamTasks),
);
router.get(
  '/tasks',
  requirePermission('field.view'),
  validate(tasks.listQuerySchema, 'query'),
  asyncHandler(tasks.listTasks),
);
router.post(
  '/tasks',
  requirePermission('field.manage'),
  validate(tasks.createTaskSchema),
  asyncHandler(tasks.createTask),
);
router.get(
  '/tasks/:id',
  requirePermission('field.view'),
  asyncHandler(tasks.getTask),
);
router.patch(
  '/tasks/:id',
  requirePermission('field.view'),
  validate(tasks.updateTaskSchema),
  asyncHandler(tasks.updateTask),
);
router.delete(
  '/tasks/:id',
  requirePermission('field.manage'),
  asyncHandler(tasks.deleteTask),
);
router.patch(
  '/tasks/:id/accept',
  requirePermission('field.view'),
  asyncHandler(tasks.acceptTask),
);
router.patch(
  '/tasks/:id/complete',
  requirePermission('field.view'),
  validate(tasks.completeSchema),
  asyncHandler(tasks.completeTask),
);

/* ── Live Tracking ── */
// The one ingest (also mounted at POST /attendance/tracking/batch): only while
// live tracking is on and the caller is clocked in.
router.post(
  '/tracking/batch',
  requirePermission('field.view'),
  validate(tracking.batchSchema),
  asyncHandler(tracking.ingestBatch),
);
router.get(
  '/tracking/live',
  requirePermission('field.view'),
  asyncHandler(tracking.liveTracking),
);
router.get(
  '/tracking/:employeeId/trail',
  requirePermission('field.view'),
  validate(tracking.trailQuerySchema, 'query'),
  asyncHandler(tracking.trackingTrail),
);
// Older name for the trail; same response.
router.get(
  '/tracking/history/:employeeId',
  requirePermission('field.view'),
  validate(tracking.trailQuerySchema, 'query'),
  asyncHandler(tracking.trackingTrail),
);

export default router;
