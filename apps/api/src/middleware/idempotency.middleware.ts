import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Idempotency middleware — prevents duplicate processing when a client
 * retries a write (e.g. mobile app loses connection after POST /subscribe
 * succeeds, retries the call, gets charged twice).
 *
 * Usage:
 *   router.post('/subscribe', idempotent(60), asyncHandler(subscribe));
 *
 * Client sends header `Idempotency-Key: <uuid>`. Our server caches the
 * response for that key + route for the TTL (default 24 hours). Subsequent
 * requests with the same key return the cached response without re-running
 * the handler.
 *
 * If the cached body's hash doesn't match the new request body, we return
 * 409 CONFLICT to prevent accidental collisions between unrelated operations.
 */

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

export function idempotent(ttlSeconds = DEFAULT_TTL_SECONDS) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('idempotency-key');
    if (!key) return next();

    // Validate key format (UUID-ish)
    if (!/^[A-Za-z0-9_\-]{8,64}$/.test(key)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be 8-64 alphanumeric chars' },
      });
      return;
    }

    // Scope the key per route so two different endpoints can't collide
    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex')
      .slice(0, 16);
    const scope = `${req.method}:${req.path}`;
    const redisKey = `idem:${scope}:${key}`;

    try {
      const cached = await redis.get(redisKey);
      if (cached) {
        const cachedObj = JSON.parse(cached) as { bodyHash: string; status: number; body: unknown };
        if (cachedObj.bodyHash !== bodyHash) {
          res.status(409).json({
            success: false,
            error: {
              code: 'IDEMPOTENCY_CONFLICT',
              message: 'This idempotency key was used with a different request body',
            },
          });
          return;
        }
        // Cache hit — replay the previous response
        logger.info({ key, scope }, 'Idempotency cache hit — replaying response');
        res.setHeader('X-Idempotency-Replay', 'true');
        res.status(cachedObj.status).json(cachedObj.body);
        return;
      }
    } catch (err) {
      // Redis down = fail open (don't block writes)
      logger.warn({ err }, 'Idempotency check failed — proceeding without cache');
      return next();
    }

    // First time seeing this key — hook into res.json to cache the response
    const originalJson = res.json.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.json = ((body: any) => {
      const status = res.statusCode;
      // Only cache successful responses — 4xx/5xx should be retryable
      if (status >= 200 && status < 300) {
        void redis.set(
          redisKey,
          JSON.stringify({ bodyHash, status, body }),
          'EX',
          ttlSeconds,
        ).catch((err) => logger.warn({ err, key }, 'Failed to cache idempotent response'));
      }
      return originalJson(body);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;

    next();
  };
}
