import type { Request, Response, NextFunction } from 'express';
import type { FileFilterCallback } from 'multer';
/**
 * Field photos (visit check-in/out selfies, task completion proof). Stored
 * privately under UPLOAD_DIR like every other upload; the response's `url`
 * is a short-lived signed link (presignResponse) which the client attaches to
 * the visit/task as-is — the server turns it back into the stored reference.
 */
export declare const MAX_PHOTO_BYTES: number;
/** multer filter: image extensions with an image/* MIME type only. */
export declare function photoFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void;
/** Maps multer's own errors (file too large, wrong field) onto 400s. */
export declare function photoUploadErrors(err: unknown, _req: Request, _res: Response, next: NextFunction): void;
/** POST /field/uploads/photo (multipart `photo`) → 201 `{ url, key }`. */
export declare function uploadPhoto(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-uploads.controller.d.ts.map