import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';
function attachLogging(client, name) {
    client.on('connect', () => logger.info(`✅ Redis connected (${name})`));
    client.on('error', (err) => logger.error({ err, client: name }, 'Redis connection error'));
    client.on('close', () => logger.warn({ client: name }, 'Redis connection closed'));
}
/**
 * BullMQ client (jobs/backup.jobs.ts). BullMQ requires
 * `maxRetriesPerRequest: null` — blocking commands must wait indefinitely —
 * which also means commands queue forever while Redis is down. Never use this
 * client on the request path.
 */
export const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
});
attachLogging(redis, 'queue');
/**
 * Request-path client (auth cache, token blacklist, rate limits, idempotency,
 * response cache). It fails fast: with the offline queue disabled a command
 * issued while Redis is unreachable rejects immediately, and `commandTimeout`
 * bounds one that was already in flight. Callers treat the rejection as "Redis
 * unavailable" and fail open, so an outage degrades the cache/rate limits
 * instead of hanging every authenticated request.
 */
export const redisApp = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    commandTimeout: 2000,
    enableReadyCheck: true,
    lazyConnect: false,
});
attachLogging(redisApp, 'app');
const QUIT_TIMEOUT_MS = 2000;
/** Graceful QUIT, falling back to a hard disconnect if Redis is down or slow. */
async function closeClient(client) {
    let timer;
    try {
        await Promise.race([
            client.quit(),
            new Promise((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Redis QUIT timed out')), QUIT_TIMEOUT_MS);
            }),
        ]);
    }
    catch {
        client.disconnect();
    }
    finally {
        clearTimeout(timer);
    }
}
export async function disconnectRedis() {
    await Promise.all([closeClient(redis), closeClient(redisApp)]);
}
//# sourceMappingURL=redis.js.map