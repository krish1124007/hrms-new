import type { Request, Response, NextFunction } from 'express';
import { redisApp } from '../config/redis.js';
import { logger } from '../config/logger.js';

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

      const count = await redisApp.incr(key);
      if (count === 1) {
        await redisApp.expire(key, ttlSeconds);
      }

      res.setHeader('X-RateLimit-Limit', String(opts.max));
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, opts.max - count)));

      if (count > opts.max) {
        const retryAfter = await redisApp.ttl(key);
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

/**
 * The lockout counters live in Redis, which `redisApp` now rejects promptly
 * when it is down. Failing the login with a 500 would turn a cache outage into
 * a full sign-in outage, so — like the rate limiters above — the helpers fail
 * open: no lock is seen and no failure is counted until Redis is back.
 */
async function failOpen<T>(operation: string, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err, operation }, 'Login lockout store unavailable — failing open');
    return fallback;
  }
}

export async function trackLoginFailure(email: string, ip: string): Promise<number> {
  return failOpen(
    'trackLoginFailure',
    async () => {
      const key = failKey(email, ip);
      const count = await redisApp.incr(key);
      if (count === 1) await redisApp.expire(key, 30 * 60);
      return count;
    },
    0,
  );
}

export async function clearLoginFailures(email: string, ip: string): Promise<void> {
  await failOpen(
    'clearLoginFailures',
    async () => {
      await redisApp.del(failKey(email, ip));
    },
    undefined,
  );
}

export async function isAccountLocked(email: string, ip: string): Promise<boolean> {
  return failOpen(
    'isAccountLocked',
    async () => Boolean(await redisApp.get(lockKey(email, ip))),
    false,
  );
}

export async function lockAccount(email: string, ip: string, minutes = 15): Promise<void> {
  await failOpen(
    'lockAccount',
    async () => {
      await redisApp.set(lockKey(email, ip), '1', 'EX', minutes * 60);
    },
    undefined,
  );
}

export async function getLockTTL(email: string, ip: string): Promise<number> {
  return failOpen('getLockTTL', async () => redisApp.ttl(lockKey(email, ip)), 0);
}
