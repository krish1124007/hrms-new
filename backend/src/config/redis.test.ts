import { describe, it, expect, vi, afterAll } from 'vitest';

// Silence the connection-error logging of the deliberately unreachable Redis.
vi.mock('./logger.js', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// The global test setup replaces config/redis.js with ioredis-mock; these
// tests need the real module (pointed at the unreachable REDIS_URL from setup).
const real = await vi.importActual<typeof import('./redis.js')>('./redis.js');

afterAll(() => {
  real.redis.disconnect();
  real.redisApp.disconnect();
});

describe('redis clients', () => {
  it('keeps the BullMQ client on unlimited retries', () => {
    expect(real.redis.options.maxRetriesPerRequest).toBeNull();
  });

  it('gives the request-path client a fail-fast configuration', () => {
    expect(real.redisApp).not.toBe(real.redis);
    expect(real.redisApp.options.maxRetriesPerRequest).toBe(2);
    expect(real.redisApp.options.enableOfflineQueue).toBe(false);
    expect(real.redisApp.options.commandTimeout).toBe(2000);
  });

  it('rejects a command promptly instead of hanging while Redis is down', async () => {
    const started = Date.now();
    await expect(real.redisApp.get('anything')).rejects.toThrow();
    expect(Date.now() - started).toBeLessThan(2500);
  });
});
