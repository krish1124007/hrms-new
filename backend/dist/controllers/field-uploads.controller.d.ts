import type { Request, Response, NextFunction } from 'express';
import type { FileFilterCallback } from 'multer';
/**
 * Field uploads: photos (check-in selfies, site photos, report photos, task
 * proof) and documents (report attachments). Stored privately under
 * UPLOAD_DIR like every other upload; the response is `{ url, key }` — `url`
 * a short-lived signed link for showing the file, `key` what the client sends
 * in the record's body (lib/field-files.ts checks it). The uploader is
 * recorded (`fielduploads`): a key can only be attached by whoever uploaded it.
 */
export declare const MAX_PHOTO_BYTES: number;
export declare const MAX_DOCUMENT_BYTES: number;
/** multer filter: image extensions with an image/* MIME type only. */
export declare function photoFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void;
/** multer filter: PDF, images, Word and Excel files. */
export declare function documentFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void;
export declare const photoUploadErrors: (err: unknown, _req: Request, _res: Response, next: NextFunction) => void;
export declare const documentUploadErrors: (err: unknown, _req: Request, _res: Response, next: NextFunction) => void;
/** POST /field/uploads/photo (multipart `photo`) → 201 `{ url, key }`. */
export declare function uploadPhoto(req: Request, res: Response): Promise<void>;
/**
 * POST /field/uploads/document (multipart `document`, or `file`) — PDF,
 * images, doc/docx, xls/xlsx up to 10 MB → 201 `{ url, key, name }` (`name`
 * is the original file name, for the report's document list).
 */
export declare function uploadDocument(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-uploads.controller.d.ts.map