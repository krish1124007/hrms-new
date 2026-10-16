import { Router } from 'express';
import * as ctrl from '../controllers/dashboard.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { cacheFor } from '../middleware/http-cache.middleware.js';

const router = Router();
router.use(authMiddleware);

// 30s cache — dashboards load often, the numbers move slowly, and the
// underlying aggregate queries are the most expensive in the system.
router.get('/overview', cacheFor('30s'), asyncHandler(ctrl.overview));
router.get('/analytics', cacheFor('60s'), asyncHandler(ctrl.analytics));
router.get('/attendance-trend', cacheFor('60s'), asyncHandler(ctrl.attendanceTrend));
router.get('/upcoming', cacheFor('5m'), asyncHandler(ctrl.upcoming));
router.get('/recent-activity', cacheFor('30s'), asyncHandler(ctrl.recentActivity));

export default router;
