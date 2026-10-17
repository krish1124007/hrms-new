/**
 * Upload allow-list shared by every multer instance. A file must pass both
 * checks: its extension and the MIME type the client declared.
 */
import path from 'node:path';
import { AppError } from './errors.js';
const ALLOWED_EXTENSIONS = new Set([
    '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif',
    // iPhone camera photos (receipts, check-in photos from the mobile app).
    '.heic', '.heif',
    '.doc', '.docx', '.xls', '.xlsx', '.csv',
]);
const ALLOWED_MIME_PREFIXES = [
    // Covers image/heic and image/heif; the extension list above is what keeps
    // out other image/* types such as SVG.
    'image/',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.',
    'application/vnd.ms-excel',
    'text/csv',
];
export function uploadFileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype.toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p))) {
        cb(null, true);
        return;
    }
    cb(new AppError('File type not allowed', 400, 'UNSUPPORTED_FILE_TYPE'));
}
//# sourceMappingURL=upload-policy.js.map