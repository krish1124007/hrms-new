import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('connect', () => logger.info('✅ Redis connected'));
redis.on('error', (err) => logger.error({ err }, 'Redis connection error'));
redis.on('close', () => logger.warn('Redis connection closed'));

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
