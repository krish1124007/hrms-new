import { Router } from 'express';
import multer from 'multer';
import * as ctrl from '../controllers/document.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
const router = Router();
router.use(authMiddleware);
// In-memory upload (handler streams the buffer to local-storage). 25 MB cap.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024 },
});
router.get('/', validate(ctrl.listDocumentsQuerySchema, 'query'), asyncHandler(ctrl.listDocuments));
router.get('/folders', asyncHandler(ctrl.listFolders));
router.post('/upload', upload.single('file'), asyncHandler(ctrl.uploadDocument));
router.get('/:id', asyncHandler(ctrl.getDocument));
router.patch('/:id', validate(ctrl.updateDocumentSchema), asyncHandler(ctrl.updateDocument));
router.delete('/:id', asyncHandler(ctrl.deleteDocument));
export default router;
//# sourceMappingURL=document.routes.js.map