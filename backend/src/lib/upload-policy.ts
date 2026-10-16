/**
 * Upload allow-list shared by every multer instance. A file must pass both
 * checks: its extension and the MIME type the client declared.
 */
import path from 'node:path';
import type { Request } from 'express';
import type { FileFilterCallback } from 'multer';
import { AppError } from './errors.js';

const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.doc', '.docx', '.xls', '.xlsx', '.csv',
]);

const ALLOWED_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.',
  'application/vnd.ms-excel',
  'text/csv',
];

export function uploadFileFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: FileFilterCallback,
): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype.toLowerCase();
  if (ALLOWED_EXTENSIONS.has(ext) && ALLOWED_MIME_PREFIXES.some((p) => mimetype.startsWith(p))) {
    cb(null, true);
    return;
  }
  cb(new AppError('File type not allowed', 400, 'UNSUPPORTED_FILE_TYPE'));
}
