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
import * as schedules from '../controllers/field-schedules.controller.js';
import * as tasks from '../controllers/field-tasks.controller.js';
import * as tracking from '../controllers/field-tracking.controller.js';
import * as team from '../controllers/field-team.controller.js';
import * as travel from '../controllers/field-travel.controller.js';
import * as reports from '../controllers/field-reports.controller.js';
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
router.put('/settings', requirePermission('field.manage'), validate(settings.updateFieldSettingsSchema), asyncHandler(settings.putSettings));
/* ── Uploads ── */
router.post('/uploads/photo', requirePermission('field.view'), photoUpload.single('photo'), uploads.photoUploadErrors, asyncHandler(uploads.uploadPhoto));
router.post('/uploads/document', requirePermission('field.view'), documentUpload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'file', maxCount: 1 },
]), uploads.documentUploadErrors, asyncHandler(uploads.uploadDocument));
/* ── Sites ── */
router.get('/sites/map', requirePermission('field.view'), validate(sites.mapQuerySchema, 'query'), asyncHandler(sites.sitesMap));
router.post('/sites/import', requirePermission('field.manage'), sheetUpload.single('file'), sites.importUploadErrors, rejectRawUploadRefs, asyncHandler(sites.importSites));
router.get('/sites', requirePermission('field.view'), validate(sites.listQuerySchema, 'query'), asyncHandler(sites.listSites));
router.post('/sites', requirePermission('field.view'), // any field employee may pin; the site is assigned to them
validate(sites.createSiteSchema), asyncHandler(sites.createSite));
router.get('/sites/:id', requirePermission('field.view'), asyncHandler(sites.getSite));
router.patch('/sites/:id', requirePermission('field.view'), // the creator within 24 h, or field.manage (checked in the controller)
validate(sites.updateSiteSchema), asyncHandler(sites.updateSite));
router.delete('/sites/:id', requirePermission('field.manage'), asyncHandler(sites.deleteSite));
/* ── Visits ── */
// Offline-safe writes (clientRef + capturedAt); the record-level rules
// (own visit, direct reports, 48 h report window) live in the controller.
router.post('/visits/check-in', requirePermission('field.view'), validate(visits.checkInSchema), asyncHandler(visits.checkIn));
router.post('/visits/plan', requirePermission('field.view'), // self and direct reports; field.manage anyone
validate(visits.planSchema), asyncHandler(visits.planVisit));
router.post('/visits/:id/check-out', requirePermission('field.view'), validate(visits.checkOutSchema), asyncHandler(visits.checkOut));
router.patch('/visits/:id/report', requirePermission('field.view'), validate(visits.reportPatchSchema), asyncHandler(visits.updateReport));
router.post('/visits/:id/cancel', requirePermission('field.view'), validate(visits.cancelSchema), asyncHandler(visits.cancelVisit));
router.get('/visits', requirePermission('field.view'), validate(visits.listQuerySchema, 'query'), asyncHandler(visits.listVisits));
router.get('/visits/:id', requirePermission('field.view'), asyncHandler(visits.getVisit));
router.delete('/visits/:id', requirePermission('field.manage'), asyncHandler(visits.deleteVisit));
/* ── My day ── */
router.get('/my-day', requirePermission('field.view'), validate(visits.myDayQuerySchema, 'query'), asyncHandler(visits.myDay));
/* ── Recurring visits ── */
router.get('/visit-schedules', requirePermission('field.view'), validate(schedules.listQuerySchema, 'query'), asyncHandler(schedules.listSchedules));
router.post('/visit-schedules', requirePermission('field.view'), // self and direct reports; field.manage anyone
validate(schedules.createScheduleSchema), asyncHandler(schedules.createSchedule));
router.get('/visit-schedules/:id', requirePermission('field.view'), asyncHandler(schedules.getSchedule));
router.patch('/visit-schedules/:id', requirePermission('field.view'), validate(schedules.updateScheduleSchema), asyncHandler(schedules.updateSchedule));
router.delete('/visit-schedules/:id', requirePermission('field.view'), asyncHandler(schedules.deleteSchedule));
/* ── Tasks ── */
router.get('/tasks/my', requirePermission('field.view'), validate(tasks.myQuerySchema, 'query'), asyncHandler(tasks.myTasks));
router.get('/tasks/team', requirePermission('field.view'), validate(tasks.myQuerySchema, 'query'), asyncHandler(tasks.teamTasks));
router.get('/tasks', requirePermission('field.view'), validate(tasks.listQuerySchema, 'query'), asyncHandler(tasks.listTasks));
router.post('/tasks', requirePermission('field.view'), // to self and direct reports; field.manage anyone
validate(tasks.createTaskSchema), asyncHandler(tasks.createTask));
router.get('/tasks/:id', requirePermission('field.view'), asyncHandler(tasks.getTask));
router.patch('/tasks/:id', requirePermission('field.view'), validate(tasks.updateTaskSchema), asyncHandler(tasks.updateTask));
router.delete('/tasks/:id', requirePermission('field.view'), // field.manage, the creator or the assignee's manager
asyncHandler(tasks.deleteTask));
router.patch('/tasks/:id/accept', requirePermission('field.view'), asyncHandler(tasks.acceptTask));
router.patch('/tasks/:id/complete', requirePermission('field.view'), validate(tasks.completeSchema), asyncHandler(tasks.completeTask));
/* ── Team status and day routes ── */
router.get('/team/status', requirePermission('field.view'), validate(team.dayQuerySchema, 'query'), asyncHandler(team.teamStatus));
router.get('/route/:employeeId', requirePermission('field.view'), validate(team.dayQuerySchema, 'query'), asyncHandler(team.employeeRoute));
/* ── Travel allowance (self) ── */
router.get('/travel/day', requirePermission('field.view'), validate(travel.travelDayQuerySchema, 'query'), asyncHandler(travel.travelDay));
router.post('/travel/claims', requirePermission('field.view'), validate(travel.travelClaimSchema), asyncHandler(travel.createTravelClaim));
/* ── Reports (JSON, or ?format=xlsx|pdf) ── */
router.get('/reports/daily', requirePermission('field.view'), validate(reports.dailyQuerySchema, 'query'), asyncHandler(reports.dailyReport));
router.get('/reports/summary', requirePermission('field.view'), validate(reports.summaryQuerySchema, 'query'), asyncHandler(reports.summaryReport));
router.get('/reports/exceptions', requirePermission('field.view'), validate(reports.rangeQuerySchema, 'query'), asyncHandler(reports.exceptionsReport));
router.get('/reports/sites', requirePermission('field.view'), validate(reports.rangeQuerySchema, 'query'), asyncHandler(reports.sitesReport));
/* ── Tracking (removed) ── */
// Locations are recorded only at check-in/check-out. Old app builds that still
// upload a location queue get 200 { ignored: true } (also at
// POST /attendance/tracking/batch); nothing is stored.
router.post('/tracking/batch', tracking.ignoreTrackingBatch);
export default router;
//# sourceMappingURL=field.routes.js.map