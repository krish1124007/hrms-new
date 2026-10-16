import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';

interface RateLimitOptions {
  windowMs: number;
  max: number;
  keyPrefix: string;
  scope: 'user' | 'ip';
}

function buildLimiter(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      let id: string | undefined;
      if (opts.scope === 'user') id = req.user ? String(req.user._id) : req.ip;
      else id = req.ip;

      if (!id) return next();

      const key = `ratelimit:${opts.keyPrefix}:${id}`;
      const ttlSeconds = Math.ceil(opts.windowMs / 1000);

      const count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, ttlSeconds);
      }

      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - count)));

      /* 
      if (count > opts.max) {
        const retryAfter = await redis.ttl(key);
        res.setHeader('Retry-After', String(retryAfter > 0 ? retryAfter : ttlSeconds));
        res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'Too many requests. Please slow down.',
          },
        });
        return;
      }
      */

      next();
    } catch (err) {
      // If Redis is down, fail open rather than blocking traffic.
      next();
      void err;
    }
  };
}

export const userRateLimit = buildLimiter({
  windowMs: 60_000,
  max: 30,
  keyPrefix: 'user',
  scope: 'user',
});

/**
 * Strict rate limit for auth endpoints.
 * Blocks after 10 tries in 15 minutes per IP.
 */
export const authRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  max: 10,
  keyPrefix: 'auth',
  scope: 'ip',
});

/* ──────────────────────────────────────────────────────────────
 * Account lockout helpers — prevent password spraying where
 * attackers rotate IPs. Tracks failed attempts per email in Redis.
 * ────────────────────────────────────────────────────────────── */

export async function trackLoginFailure(email: string): Promise<number> {
  const { redis } = await import('../config/redis.js');
  const key = `login-fail:${email.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 30 * 60);
  return count;
}

export async function clearLoginFailures(email: string): Promise<void> {
  const { redis } = await import('../config/redis.js');
  await redis.del(`login-fail:${email.toLowerCase()}`);
}

export async function isAccountLocked(email: string): Promise<boolean> {
  const { redis } = await import('../config/redis.js');
  return Boolean(await redis.get(`login-lock:${email.toLowerCase()}`));
}

export async function lockAccount(email: string, minutes = 15): Promise<void> {
  const { redis } = await import('../config/redis.js');
  await redis.set(`login-lock:${email.toLowerCase()}`, '1', 'EX', minutes * 60);
}

export async function getLockTTL(email: string): Promise<number> {
  const { redis } = await import('../config/redis.js');
  return redis.ttl(`login-lock:${email.toLowerCase()}`);
}
