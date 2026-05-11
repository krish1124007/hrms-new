import { Router } from 'express';
import * as ctrl from '../controllers/calendar.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
// Read access stays open — the controller already scopes results so an employee
// only sees events they created or were invited to. Mutations are HR/admin-only
// since employees aren't expected to schedule company events.
router.get('/events', validate(ctrl.listEventsQuerySchema, 'query'), asyncHandler(ctrl.listEvents));
router.post('/events', requirePermission('events.manage'), validate(ctrl.createEventSchema), asyncHandler(ctrl.createEvent));
router.get('/events/:id', asyncHandler(ctrl.getEvent));
router.patch('/events/:id', requirePermission('events.manage'), validate(ctrl.updateEventSchema), asyncHandler(ctrl.updateEvent));
router.delete('/events/:id', requirePermission('events.manage'), asyncHandler(ctrl.deleteEvent));
export default router;
//# sourceMappingURL=calendar.routes.js.map