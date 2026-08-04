import { Router } from 'express';
import multer, { MulterError } from 'multer';
import * as ctrl from '../controllers/hr-policies.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/permission.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { ValidationAppError } from '../lib/errors.js';
const router = Router();
router.use(authMiddleware);
// In-memory upload for policy PDF attachments — 25 MB cap, same as documents.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});
/**
 * Multer's own failures (size cap hit, missing boundary, wrong field name)
 * are plain `MulterError`s — the global error handler doesn't recognise them
 * and would report a bare 500 "Internal server error". Translate them into a
 * 400 with a message the client can actually show.
 */
const uploadAttachmentFile = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err instanceof MulterError) {
            next(new ValidationAppError(err.code === 'LIMIT_FILE_SIZE'
                ? 'Attachment exceeds the 25 MB upload limit'
                : `Attachment upload failed: ${err.message}`));
            return;
        }
        next(err);
    });
};
router.get('/published', asyncHandler(ctrl.listPublished));
router.get('/', requirePermission('policies.view'), validate(ctrl.listQuerySchema, 'query'), asyncHandler(ctrl.list));
router.get('/stats', requirePermission('policies.view'), asyncHandler(ctrl.stats));
router.post('/', requirePermission('policies.manage'), validate(ctrl.createSchema), asyncHandler(ctrl.create));
router.get('/:id', requirePermission('policies.view'), asyncHandler(ctrl.get));
router.patch('/:id', requirePermission('policies.manage'), validate(ctrl.updateSchema), asyncHandler(ctrl.update));
router.delete('/:id', requirePermission('policies.manage'), asyncHandler(ctrl.remove));
router.post('/:id/publish', requirePermission('policies.manage'), validate(ctrl.publishSchema), asyncHandler(ctrl.publish));
router.post('/:id/archive', requirePermission('policies.manage'), asyncHandler(ctrl.archive));
router.post('/:id/restore', requirePermission('policies.manage'), asyncHandler(ctrl.restore));
router.get('/:id/acknowledgements', requirePermission('policies.view'), asyncHandler(ctrl.listAcknowledgements));
router.post('/:id/acknowledge', requirePermission('policies.view'), validate(ctrl.acknowledgeSchema), asyncHandler(ctrl.acknowledge));
/* ── Attachments ── */
router.post('/:id/attachments', requirePermission('policies.manage'), uploadAttachmentFile, asyncHandler(ctrl.uploadAttachment));
router.delete('/:id/attachments/:attachmentId', requirePermission('policies.manage'), asyncHandler(ctrl.deleteAttachment));
export default router;
//# sourceMappingURL=hr-policies.routes.js.map