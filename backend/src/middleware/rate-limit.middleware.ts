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
 * Blocks after 20 tries in 15 minutes per IP.
 */
export const authRateLimit = buildLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  keyPrefix: 'auth',
  scope: 'ip',
});

/* ──────────────────────────────────────────────────────────────
 * Account lockout helpers — slow down password guessing. Counters and
 * locks are scoped to email + client IP, so an attacker spamming a
 * victim's email only locks themselves out; the real user signing in
 * from another address is unaffected. Callers track unknown emails the
 * same as real ones so lockout is not an account-existence oracle.
 * ────────────────────────────────────────────────────────────── */

const failKey = (email: string, ip: string): string => `login-fail:${email.toLowerCase()}:${ip}`;
const lockKey = (email: string, ip: string): string => `login-lock:${email.toLowerCase()}:${ip}`;

export async function trackLoginFailure(email: string, ip: string): Promise<number> {
  const { redis } = await import('../config/redis.js');
  const key = failKey(email, ip);
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 30 * 60);
  return count;
}

export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  const { redis } = await import('../config/redis.js');
  await redis.del(failKey(email, ip));
}

export async function isAccountLocked(email: string, ip: string): Promise<boolean> {
  const { redis } = await import('../config/redis.js');
  return Boolean(await redis.get(lockKey(email, ip)));
}

export async function lockAccount(email: string, ip: string, minutes = 15): Promise<void> {
  const { redis } = await import('../config/redis.js');
  await redis.set(lockKey(email, ip), '1', 'EX', minutes * 60);
}

export async function getLockTTL(email: string, ip: string): Promise<number> {
  const { redis } = await import('../config/redis.js');
  return redis.ttl(lockKey(email, ip));
}
