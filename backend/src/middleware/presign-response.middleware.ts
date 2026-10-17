import type { Request, Response, NextFunction } from 'express';
import { isStaleSignedUrl, signFileUrl, storedFormOfSignedUrl } from '../lib/file-urls.js';
import { AppError } from '../lib/errors.js';

const UPLOADS_PREFIX = '/uploads/';
const FILES_PATH = '/api/v1/files/';

/** Copy of a JSON value with every string passed through `fn`. */
function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, fn));
  if (value !== null && typeof value === 'object') {
    // fromEntries defines own properties, so a `__proto__` key stays a key.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return value;
}

const signIfStored = (s: string): string => (s.startsWith(UPLOADS_PREFIX) ? signFileUrl(s) : s);

/**
 * Rewrites every stored `/uploads/<key>` reference in a JSON response into a
 * short-lived signed link to /api/v1/files/<key>. The body is serialised first
 * (`toJSON` turns Mongoose documents, ObjectIds and Dates into plain JSON —
 * walking a live document tree is unsafe), and only walked when it contains
 * `/uploads/` at all.
 */
export function presignResponse(_req: Request, res: Response, next: NextFunction): void {
  const json = res.json.bind(res);
  res.json = (body?: unknown) => {
    if (body === null || typeof body !== 'object') return json(body);
    const serialised = JSON.stringify(body);
    if (serialised === undefined || !serialised.includes(UPLOADS_PREFIX)) return json(body);
    return json(mapStrings(JSON.parse(serialised), signIfStored));
  };
  next();
}

/**
 * A client-supplied string that is, or that server-side clean-up (trimming,
 * `\` → `/`, adding a leading `/` as document folders do) could turn into, a
 * stored `/uploads/` reference — which presignResponse would then sign.
 */
const RAW_UPLOAD_REF = /^[\s\\/]*uploads[\\/]/;

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
export function unsignRequestBody(req: Request, _res: Response, next: NextFunction): void {
  const body: unknown = req.body;
  if (body === null || typeof body !== 'object') {
    next();
    return;
  }
  const serialised = JSON.stringify(body);
  if (!serialised.includes('uploads') && !serialised.includes(FILES_PATH)) {
    next();
    return;
  }
  let raw = false;
  let stale = false;
  const normalised = mapStrings(body, (s) => {
    if (RAW_UPLOAD_REF.test(s)) {
      raw = true;
      return s;
    }
    if (!s.includes(FILES_PATH)) return s;
    const stored = storedFormOfSignedUrl(s);
    if (stored) return stored;
    if (isStaleSignedUrl(s)) stale = true;
    return s;
  });
  if (raw) {
    next(new AppError('File references must be links issued by the API', 400, 'INVALID_FILE_REFERENCE'));
    return;
  }
  if (stale) {
    next(
      new AppError(
        'A file link in this request has expired. Reload the page and try again.',
        400,
        'INVALID_FILE_REFERENCE',
      ),
    );
    return;
  }
  req.body = normalised;
  next();
}

/**
 * The same check for multipart text fields, which multer parses after the
 * global middleware has run. Mount right after `upload.single(...)`. Other
 * bodies were already handled globally (and must not be checked twice: their
 * converted links now start with `/uploads/`).
 */
export function rejectRawUploadRefs(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('multipart/form-data')) {
    next();
    return;
  }
  unsignRequestBody(req, res, next);
}
