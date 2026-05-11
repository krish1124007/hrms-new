import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
/**
 * Redis-backed memoization for expensive read operations.
 *
 * Usage:
 *   const plans = await cached('plans:all', 300, () => Plan.find().lean());
 *
 * Invalidate with:
 *   await invalidate('plans:*');
 *
 * Fail-open: if Redis is unreachable, the fallback function still executes.
 */
export async function cached(key, ttlSeconds, fetcher) {
    try {
        const hit = await redis.get(key);
        if (hit)
            return JSON.parse(hit);
    }
    catch (err) {
        logger.warn({ err, key }, 'Cache read failed — falling back to DB');
    }
    const value = await fetcher();
    try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    }
    catch (err) {
        logger.warn({ err, key }, 'Cache write failed');
    }
    return value;
}
/** Invalidate a single key or a glob pattern (e.g. `plans:*`). */
export async function invalidate(keyOrPattern) {
    try {
        if (keyOrPattern.includes('*')) {
            // SCAN + DEL avoids blocking Redis with a huge KEYS call
            let cursor = '0';
            let deleted = 0;
            do {
                const [next, keys] = await redis.scan(cursor, 'MATCH', keyOrPattern, 'COUNT', 100);
                cursor = next;
                if (keys.length > 0) {
                    deleted += await redis.del(...keys);
                }
            } while (cursor !== '0');
            return deleted;
        }
        return await redis.del(keyOrPattern);
    }
    catch (err) {
        logger.warn({ err, pattern: keyOrPattern }, 'Cache invalidation failed');
        return 0;
    }
}
//# sourceMappingURL=cache.js.map