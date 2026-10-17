import { Redis } from 'ioredis';
/**
 * BullMQ client (jobs/backup.jobs.ts). BullMQ requires
 * `maxRetriesPerRequest: null` — blocking commands must wait indefinitely —
 * which also means commands queue forever while Redis is down. Never use this
 * client on the request path.
 */
export declare const redis: Redis;
/**
 * Request-path client (auth cache, token blacklist, rate limits, idempotency,
 * response cache). It fails fast: with the offline queue disabled a command
 * issued while Redis is unreachable rejects immediately, and `commandTimeout`
 * bounds one that was already in flight. Callers treat the rejection as "Redis
 * unavailable" and fail open, so an outage degrades the cache/rate limits
 * instead of hanging every authenticated request.
 */
export declare const redisApp: Redis;
export declare function disconnectRedis(): Promise<void>;
//# sourceMappingURL=redis.d.ts.map