/**
 * Short-lived signed links to files in UPLOAD_DIR.
 *
 * Stored references keep their legacy `/uploads/<key>` form; the API turns
 * them into `<base>/api/v1/files/<key>?exp=<unix>&sig=<hex>` on the way out
 * (see presign-response.middleware.ts), and only the files route serves
 * bytes — after checking the signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

const FILES_PATH = '/api/v1/files/';
const UPLOADS_PREFIX = '/uploads/';
/** `[origin]/api/v1/files/<encoded key>?<query>` — the shape signFileUrl emits. */
const SIGNED_URL_RE = /^(?:https?:\/\/[^/?#]+)?\/api\/v1\/files\/([^?#]+)\?([^#]*)$/;

function baseUrl(): string {
  const base =
    env.PUBLIC_BASE_URL ??
    (env.NODE_ENV === 'production' ? env.CORS_ORIGIN : `http://localhost:${env.PORT}`);
  return base.replace(/\/+$/, '');
}

function signature(key: string, exp: string): string {
  return createHmac('sha256', `${env.JWT_SECRET}:files`).update(`${key}\n${exp}`).digest('hex');
}

/** True when `sig` is the signature of `key` + `exp`, whatever the clock says. */
function isAuthentic(key: string, exp: string, sig: string): boolean {
  if (!/^\d+$/.test(exp)) return false;
  const expected = Buffer.from(signature(key, exp));
  const given = Buffer.from(sig);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Absolute, signed download URL for a storage key or a stored `/uploads/<key>`
 * reference, valid for `ttlSeconds`.
 */
export function signFileUrl(keyOrUrl: string, ttlSeconds = env.FILE_URL_TTL_SECONDS): string {
  const key = keyOrUrl.startsWith(UPLOADS_PREFIX) ? keyOrUrl.slice(UPLOADS_PREFIX.length) : keyOrUrl;
  const exp = String(Math.floor(Date.now() / 1000) + ttlSeconds);
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  return `${baseUrl()}${FILES_PATH}${encodedKey}?exp=${exp}&sig=${signature(key, exp)}`;
}

/** Constant-time check of a link's signature; false once `exp` has passed. */
export function verifyFileSignature(key: string, exp: string, sig: string): boolean {
  if (!isAuthentic(key, exp, sig)) return false;
  return Number(exp) >= Math.floor(Date.now() / 1000);
}

/**
 * The stored `/uploads/<key>` form of a signed link this server issued, or
 * null for anything else. Expiry is ignored: a client that held a form open
 * past the TTL is still posting back a reference it was legitimately given.
 */
export function storedFormOfSignedUrl(value: string): string | null {
  const match = SIGNED_URL_RE.exec(value);
  if (!match) return null;
  const query = new URLSearchParams(match[2]);
  const exp = query.get('exp');
  const sig = query.get('sig');
  if (!exp || !sig) return null;
  let key: string;
  try {
    key = decodeURIComponent(match[1] ?? '');
  } catch {
    return null;
  }
  return isAuthentic(key, exp, sig) ? `${UPLOADS_PREFIX}${key}` : null;
}
