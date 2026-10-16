import type { Request, Response, NextFunction } from 'express';
import { signFileUrl, storedFormOfSignedUrl } from '../lib/file-urls.js';

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
const unsignIfSigned = (s: string): string =>
  s.includes(FILES_PATH) ? (storedFormOfSignedUrl(s) ?? s) : s;

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
 * The inbound half: clients post back the signed links they were given (an
 * upload's URL attached to an employee or an expense claim). Turn any link
 * this server signed back into its stored `/uploads/<key>` form, so what lands
 * in the database never expires. Strings whose signature does not check out
 * are left exactly as sent.
 */
export function unsignRequestBody(req: Request, _res: Response, next: NextFunction): void {
  if (req.body !== null && typeof req.body === 'object' && JSON.stringify(req.body).includes(FILES_PATH)) {
    req.body = mapStrings(req.body, unsignIfSigned);
  }
  next();
}
