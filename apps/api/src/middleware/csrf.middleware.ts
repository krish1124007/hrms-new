import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { ForbiddenError } from '../lib/errors.js';

/**
 * Double-submit cookie CSRF protection.
 *
 * On first GET, sets a `csrf-token` cookie (non-httpOnly so JS can read it).
 * On state-changing requests (POST/PATCH/PUT/DELETE), requires the same
 * value in the `X-CSRF-Token` header AND the `csrf-token` cookie.
 *
 * This mitigates CSRF even if/when we move to cookie-based auth.
 * For bearer-token auth (current), CSRF isn't exploitable, but defense-
 * in-depth is cheap.
 *
 * Skipped for:
 *  - API routes that don't rely on cookies (Bearer token only)
 *  - Webhooks (sign with HMAC instead)
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_NAME = 'csrf-token';
const HEADER_NAME = 'x-csrf-token';

function generateToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Bearer-token API clients are CSRF-immune — attackers can't read a header
  // from another origin. Skip entirely.
  const usingBearer = req.header('authorization')?.startsWith('Bearer ');
  if (usingBearer) return next();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookies = (req as any).cookies ?? {};

  // Non-bearer + no session cookies at all → this is a public/pre-auth request
  // (login, register, health check, etc.). No session to protect, skip.
  const hasSessionCookie = Object.keys(cookies).some(
    (k) => k === 'session' || k === 'sid' || k === 'connect.sid',
  );
  if (!hasSessionCookie && !cookies[COOKIE_NAME]) return next();

  // Issue CSRF token on safe requests so the SPA can read it and echo it back
  let token = cookies[COOKIE_NAME] as string | undefined;
  if (!token && SAFE_METHODS.has(req.method)) {
    token = generateToken();
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false, // JS must read it to echo in header
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24h
    });
  }

  if (SAFE_METHODS.has(req.method)) return next();

  // Enforce on unsafe methods
  const headerToken = req.header(HEADER_NAME);
  if (!token || !headerToken || !timingSafeEqual(token, headerToken)) {
    throw new ForbiddenError('CSRF token missing or invalid');
  }

  next();
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}
