import path from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { FileFilterCallback } from 'multer';
import { AppError, ValidationAppError } from '../lib/errors.js';
import { saveFile } from '../lib/local-storage.js';
import { businessYearMonth } from '../lib/field-utils.js';
import { newFieldFileKey, recordFieldUpload, type FieldFileKind } from '../lib/field-files.js';

/**
 * Field uploads: photos (check-in selfies, site photos, report photos, task
 * proof) and documents (report attachments). Stored privately under
 * UPLOAD_DIR like every other upload; the response is `{ url, key }` — `url`
 * a short-lived signed link for showing the file, `key` what the client sends
 * in the record's body (lib/field-files.ts checks it). The uploader is
 * recorded (`fielduploads`): a key can only be attached by whoever uploaded it.
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif']);
const DOCUMENT_EXTENSIONS = new Set([...IMAGE_EXTENSIONS, '.pdf', '.doc', '.docx', '.xls', '.xlsx']);
const DOCUMENT_MIME_PREFIXES = [
  'image/',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.',
  'application/vnd.ms-excel',
  // Some phones send office files as a generic binary.
  'application/octet-stream',
];

/** multer filter: image extensions with an image/* MIME type only. */
export function photoFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext) && file.mimetype.toLowerCase().startsWith('image/')) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only JPEG, PNG, WebP or HEIC photos can be uploaded', 400, 'UNSUPPORTED_FILE_TYPE'));
}

/** multer filter: PDF, images, Word and Excel files. */
export function documentFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();
  if (DOCUMENT_EXTENSIONS.has(ext) && DOCUMENT_MIME_PREFIXES.some((p) => mime.startsWith(p))) {
    cb(null, true);
    return;
  }
  cb(new AppError('Only PDF, image, Word or Excel files can be uploaded', 400, 'UNSUPPORTED_FILE_TYPE'));
}

/** The image format the bytes actually are, or null. */
function sniffImage(buf: Buffer): '.jpg' | '.png' | '.webp' | '.heic' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return '.png';
  }
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return '.webp';
  }
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buf.toString('ascii', 8, 12);
    if (['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'heim', 'heis'].includes(brand)) return '.heic';
  }
  return null;
}

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

/**
 * The extension a document is stored under, when its bytes match what its
 * name claims (PDF, legacy Office, OOXML, or an image); null otherwise.
 */
function sniffDocument(buf: Buffer, claimedExt: string): string | null {
  switch (claimedExt) {
    case '.pdf':
      return buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-' ? '.pdf' : null;
    case '.doc':
    case '.xls':
      return buf.length >= 8 && buf.subarray(0, 8).equals(OLE) ? claimedExt : null;
    case '.docx':
    case '.xlsx':
      return buf.length >= 4 && buf.subarray(0, 4).equals(ZIP) ? claimedExt : null;
    default:
      return sniffImage(buf);
  }
}

/** Maps multer's own errors (file too large, wrong field) onto 400s. */
function uploadErrors(field: string, what: string) {
  return (err: unknown, _req: Request, _res: Response, next: NextFunction): void => {
    if (err && typeof err === 'object' && (err as { name?: string }).name === 'MulterError') {
      const code = (err as { code?: string }).code;
      next(
        code === 'LIMIT_FILE_SIZE'
          ? new AppError(`${what} can be at most 10 MB`, 400, 'FILE_TOO_LARGE')
          : new ValidationAppError(`Send the file as a multipart "${field}" field`),
      );
      return;
    }
    next(err);
  };
}

export const photoUploadErrors = uploadErrors('photo', 'Photos');
export const documentUploadErrors = uploadErrors('document', 'Documents');

async function store(
  req: Request,
  kind: FieldFileKind,
  ext: string,
  file: Express.Multer.File,
): Promise<{ url: string; key: string }> {
  const { year, month } = businessYearMonth();
  const key = newFieldFileKey(kind, ext, year, month, randomBytes(6).toString('hex'));
  const url = await saveFile(key, file.buffer, file.mimetype);
  await recordFieldUpload(key, kind, req.user?._id);
  return { url, key };
}

/** POST /field/uploads/photo (multipart `photo`) → 201 `{ url, key }`. */
export async function uploadPhoto(req: Request, res: Response): Promise<void> {
  const file = req.file;
  if (!file) throw new ValidationAppError('No photo uploaded — send a multipart "photo" field');
  const kind = sniffImage(file.buffer);
  if (!kind) throw new AppError('The file is not a JPEG, PNG, WebP or HEIC image', 400, 'UNSUPPORTED_FILE_TYPE');
  res.status(201).json({ success: true, data: await store(req, 'photo', kind, file) });
}

/**
 * POST /field/uploads/document (multipart `document`, or `file`) — PDF,
 * images, doc/docx, xls/xlsx up to 10 MB → 201 `{ url, key, name }` (`name`
 * is the original file name, for the report's document list).
 */
export async function uploadDocument(req: Request, res: Response): Promise<void> {
  const files = req.files as Record<string, Express.Multer.File[]> | undefined;
  const file = files?.document?.[0] ?? files?.file?.[0];
  if (!file) throw new ValidationAppError('No document uploaded — send a multipart "document" field');
  const ext = sniffDocument(file.buffer, path.extname(file.originalname).toLowerCase());
  if (!ext) {
    throw new AppError('The file’s contents do not match its type', 400, 'UNSUPPORTED_FILE_TYPE');
  }
  const stored = await store(req, 'document', ext, file);
  const name = path.basename(file.originalname).slice(0, 200);
  res.status(201).json({ success: true, data: { ...stored, name } });
}
