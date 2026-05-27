import { Router } from 'express';
import * as ctrl from '../controllers/attendance.controller.js';
import * as res from '../controllers/attendance-resources.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
// ---------- CONFIG ----------
router.get('/config', asyncHandler(ctrl.getConfig));
router.put('/config', requirePermission('attendance.config'), validate(ctrl.updateConfigSchema), asyncHandler(ctrl.updateConfig));
// ---------- CHECK-IN / OUT / BREAKS ----------
router.post('/check-in', requirePermission('attendance.checkin'), validate(ctrl.checkInSchema), asyncHandler(ctrl.checkIn));
router.post('/check-out', requirePermission('attendance.checkin'), validate(ctrl.checkOutSchema), asyncHandler(ctrl.checkOut));
router.post('/breaks/start', requirePermission('attendance.checkin'), validate(ctrl.breakStartSchema), asyncHandler(ctrl.startBreak));
router.post('/breaks/end', requirePermission('attendance.checkin'), asyncHandler(ctrl.endBreak));
// ---------- RECORDS ----------
router.get('/records', requirePermission('attendance.view'), validate(ctrl.listRecordsSchema, 'query'), asyncHandler(ctrl.listRecords));
router.get('/my', asyncHandler(ctrl.myAttendance));
router.get('/my-shift', asyncHandler(ctrl.myShift));
router.get('/today', asyncHandler(ctrl.todayAttendance));
router.get('/monthly', validate(ctrl.monthlyQuerySchema, 'query'), asyncHandler(ctrl.monthlyAttendance));
router.post('/regularize', validate(ctrl.regularizeSchema), asyncHandler(ctrl.requestRegularization));
router.patch('/regularize/:id', requirePermission('attendance.approve'), validate(ctrl.approveRegularizationSchema), asyncHandler(ctrl.decideRegularization));
router.get('/dashboard', requirePermission('attendance.view'), asyncHandler(ctrl.dashboardStats));
router.get('/report', requirePermission('attendance.view'), validate(ctrl.reportQuerySchema, 'query'), asyncHandler(ctrl.attendanceReport));
// ---------- SITES ----------
router.get('/sites', requirePermission('attendance.view'), validate(res.listSchema, 'query'), asyncHandler(res.listSites));
router.post('/sites', requirePermission('attendance.config'), validate(res.createSiteSchema), asyncHandler(res.createSite));
router.get('/sites/:id', requirePermission('attendance.view'), asyncHandler(res.getSite));
router.patch('/sites/:id', requirePermission('attendance.config'), validate(res.updateSiteSchema), asyncHandler(res.updateSite));
router.delete('/sites/:id', requirePermission('attendance.config'), asyncHandler(res.deleteSite));
router.post('/sites/:id/assign', requirePermission('attendance.config'), validate(res.assignEmployeesSchema), asyncHandler(res.assignEmployees));
// ---------- GEOFENCE ZONES ----------
router.get('/geofences', requirePermission('attendance.view'), validate(res.listSchema, 'query'), asyncHandler(res.listGeofences));
router.post('/geofences', requirePermission('attendance.config'), validate(res.createGeofenceSchema), asyncHandler(res.createGeofence));
router.get('/geofences/:id', requirePermission('attendance.view'), asyncHandler(res.getGeofence));
router.patch('/geofences/:id', requirePermission('attendance.config'), validate(res.updateGeofenceSchema), asyncHandler(res.updateGeofence));
router.delete('/geofences/:id', requirePermission('attendance.config'), asyncHandler(res.deleteGeofence));
// ---------- QR CODES ----------
router.get('/qr-codes', requirePermission('attendance.config'), validate(res.listSchema, 'query'), asyncHandler(res.listQRCodes));
router.post('/qr-codes', requirePermission('attendance.config'), validate(res.createQRSchema), asyncHandler(res.createQRCode));
router.post('/qr-codes/rotate', requirePermission('attendance.config'), asyncHandler(res.rotateDynamicQR));
router.delete('/qr-codes/:id', requirePermission('attendance.config'), asyncHandler(res.deleteQRCode));
// ---------- ALLOWED IPs ----------
router.get('/allowed-ips', requirePermission('attendance.config'), validate(res.listSchema, 'query'), asyncHandler(res.listAllowedIPs));
router.post('/allowed-ips', requirePermission('attendance.config'), validate(res.createAllowedIPSchema), asyncHandler(res.createAllowedIP));
router.patch('/allowed-ips/:id', requirePermission('attendance.config'), validate(res.updateAllowedIPSchema), asyncHandler(res.updateAllowedIP));
router.delete('/allowed-ips/:id', requirePermission('attendance.config'), asyncHandler(res.deleteAllowedIP));
export default router;
//# sourceMappingURL=attendance.routes.js.map