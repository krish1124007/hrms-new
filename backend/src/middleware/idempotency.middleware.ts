import type { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { redisApp } from '../config/redis.js';
import { logger } from '../config/logger.js';

/**
 * Idempotency middleware — prevents duplicate processing when a client
 * retries a write (e.g. the mobile app loses connection after POST /payments
 * succeeds and retries, which would otherwise record the collection twice).
 *
 * Usage (after auth, so the key is scoped to the caller):
 *   router.post('/payments', idempotent(), asyncHandler(createPayment));
 *
 * Client sends header `Idempotency-Key: <uuid>`. The first successful (2xx)
 * response for that user + route + key is cached for the TTL (default 24 h);
 * a repeat replays it (`X-Idempotency-Replay: true`) without re-running the
 * handler. A repeat while the first is still running gets 409
 * `IDEMPOTENCY_IN_PROGRESS`; a repeat with a different body gets 409
 * `IDEMPOTENCY_CONFLICT`. Failed responses are not cached, so they can be
 * retried. No header → no idempotency. Redis down → fail open.
 */

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
/** How long an in-flight marker may live if the request never finishes. */
const LOCK_TTL_SECONDS = 60;

export function idempotent(ttlSeconds = DEFAULT_TTL_SECONDS) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const key = req.header('idempotency-key');
    if (!key) return next();

    // Validate key format (UUID-ish)
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(key)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key must be 8-64 alphanumeric chars' },
      });
      return;
    }

    const bodyHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex')
      .slice(0, 16);
    // Scoped per caller and per route: one user's key never replays another
    // user's response, and two endpoints never collide.
    const caller = req.user?._id ? String(req.user._id) : 'anon';
    const scope = `${caller}:${req.method}:${req.baseUrl}${req.path}`;
    const redisKey = `idem:${scope}:${key}`;
    const lockKey = `${redisKey}:lock`;

    /** Answer from a cached response (replay, or 409 for a different body). */
    const replay = (cached: string): void => {
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
      logger.info({ key, scope }, 'Idempotency cache hit — replaying response');
      res.setHeader('X-Idempotency-Replay', 'true');
      res.status(cachedObj.status).json(cachedObj.body);
    };

    try {
      const cached = await redisApp.get(redisKey);
      if (cached) {
        replay(cached);
        return;
      }
      const acquired = await redisApp.set(lockKey, '1', 'EX', LOCK_TTL_SECONDS, 'NX');
      if (acquired !== 'OK') {
        res.status(409).json({
          success: false,
          error: {
            code: 'IDEMPOTENCY_IN_PROGRESS',
            message: 'A request with this idempotency key is still being processed — retry shortly',
          },
        });
        return;
      }
      // The first request may have finished — cached its response and freed
      // the lock — between our read and our lock: read again before running.
      const cachedMeanwhile = await redisApp.get(redisKey);
      if (cachedMeanwhile) {
        await redisApp.del(lockKey);
        replay(cachedMeanwhile);
        return;
      }
    } catch (err) {
      // Redis down = fail open (don't block writes)
      logger.warn({ err }, 'Idempotency check failed — proceeding without cache');
      return next();
    }

    let released = false;
    const release = (): void => {
      if (released) return;
      released = true;
      void redisApp.del(lockKey).catch((err) => logger.warn({ err, key }, 'Failed to release idempotency lock'));
    };

    // First time seeing this key — hook into res.json to cache the response
    const originalJson = res.json.bind(res);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    res.json = ((body: any) => {
      const status = res.statusCode;
      // Only cache successful responses — 4xx/5xx should be retryable.
      // The response goes out once the cached copy is in place (bounded by
      // the client's command timeout), so a client that saw it and retries
      // always gets the replay.
      if (status >= 200 && status < 300) {
        let serialised: string;
        try {
          serialised = JSON.stringify({ bodyHash, status, body });
        } catch (err) {
          logger.warn({ err, key }, 'Idempotent response is not serialisable — not cached');
          release();
          return originalJson(body);
        }
        redisApp
          .set(redisKey, serialised, 'EX', ttlSeconds)
          .catch((err) => logger.warn({ err, key }, 'Failed to cache idempotent response'))
          .finally(() => {
            release();
            originalJson(body);
          });
        return res;
      }
      release();
      return originalJson(body);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }) as any;
    // A response sent some other way (or a dropped connection) still frees the key.
    res.on('close', () => {
      if (!(res.statusCode >= 200 && res.statusCode < 300)) release();
    });

    next();
  };
}
