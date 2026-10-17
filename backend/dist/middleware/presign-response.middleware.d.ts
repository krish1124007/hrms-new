import type { Request, Response, NextFunction } from 'express';
/**
 * Rewrites every stored `/uploads/<key>` reference in a JSON response into a
 * short-lived signed link to /api/v1/files/<key>. The body is serialised first
 * (`toJSON` turns Mongoose documents, ObjectIds and Dates into plain JSON —
 * walking a live document tree is unsafe), and only walked when it contains
 * `/uploads/` at all.
 */
export declare function presignResponse(_req: Request, res: Response, next: NextFunction): void;
/**
 * The inbound half. Clients may reference files only through links the API
 * issued:
 *  - a signed link this server issued (an upload's URL attached to an
 *    employee or an expense claim) is turned back into its stored
 *    `/uploads/<key>` form, so what lands in the database never expires —
 *    as long as it is no more than an hour past its expiry;
 *  - an authentic link older than that is refused with 400
 *    INVALID_FILE_REFERENCE: converting it would re-grant access to an old
 *    link, and storing it verbatim would silently replace the file
 *    reference with a dead URL. The client reloads and gets fresh links;
 *  - links whose signature does not check out are left exactly as sent;
 *  - a raw `/uploads/…` reference is refused with 400 INVALID_FILE_REFERENCE:
 *    echoed back, it would be signed into a download grant for any key.
 * The raw check runs on the strings as the client sent them, before any
 * signed link is converted.
 */
export declare function unsignRequestBody(req: Request, _res: Response, next: NextFunction): void;
/**
 * The same check for multipart text fields, which multer parses after the
 * global middleware has run. Mount right after `upload.single(...)`. Other
 * bodies were already handled globally (and must not be checked twice: their
 * converted links now start with `/uploads/`).
 */
export declare function rejectRawUploadRefs(req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=presign-response.middleware.d.ts.map