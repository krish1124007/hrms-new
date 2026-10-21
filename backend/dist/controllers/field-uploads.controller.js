import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { AppError, ValidationAppError } from '../lib/errors.js';
import { saveFile } from '../lib/local-storage.js';
import { businessYearMonth } from '../lib/field-utils.js';
/**
 * Field photos (visit check-in/out selfies, task completion proof). Stored
 * privately under UPLOAD_DIR like every other upload; the response's `url`
 * is a short-lived signed link (presignResponse) which the client attaches to
 * the visit/task as-is — the server turns it back into the stored reference.
 */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
/** multer filter: image extensions with an image/* MIME type only. */
export function photoFileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (IMAGE_EXTENSIONS.has(ext) && file.mimetype.toLowerCase().startsWith('image/')) {
        cb(null, true);
        return;
    }
    cb(new AppError('Only JPEG, PNG, WebP or HEIC photos can be uploaded', 400, 'UNSUPPORTED_FILE_TYPE'));
}
/** The image format the bytes actually are, or null. */
function sniffImage(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return '.jpg';
    if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return '.png';
    }
    if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
        return '.webp';
    }
    if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
        const brand = buf.toString('ascii', 8, 12);
        if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand))
            return '.heic';
    }
    return null;
}
/** Maps multer's own errors (file too large, wrong field) onto 400s. */
export function photoUploadErrors(err, _req, _res, next) {
    if (err && typeof err === 'object' && err.name === 'MulterError') {
        const code = err.code;
        next(code === 'LIMIT_FILE_SIZE'
            ? new AppError('Photos can be at most 10 MB', 400, 'FILE_TOO_LARGE')
            : new ValidationAppError('Send the photo as a multipart "photo" field'));
        return;
    }
    next(err);
}
/** POST /field/uploads/photo (multipart `photo`) → 201 `{ url, key }`. */
export async function uploadPhoto(req, res) {
    const file = req.file;
    if (!file)
        throw new ValidationAppError('No photo uploaded — send a multipart "photo" field');
    const kind = sniffImage(file.buffer);
    if (!kind)
        throw new AppError('The file is not a JPEG, PNG, WebP or HEIC image', 400, 'UNSUPPORTED_FILE_TYPE');
    const { year, month } = businessYearMonth();
    const key = `field-photos/${year}/${String(month).padStart(2, '0')}/${Date.now()}-${randomBytes(6).toString('hex')}${kind}`;
    const url = await saveFile(key, file.buffer, file.mimetype);
    res.status(201).json({ success: true, data: { url, key } });
}
//# sourceMappingURL=field-uploads.controller.js.map