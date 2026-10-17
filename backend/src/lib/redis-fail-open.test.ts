import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { redisApp } from '../config/redis.js';
import { isTokenRevoked, getCachedSessionVersion, revokeToken } from './token-blacklist.js';
import { cached } from './cache.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';

const down = () => new Error('Stream isn\'t writeable and enableOfflineQueue options is false');

afterEach(() => {
  vi.restoreAllMocks();
});

describe('request-path Redis users fail open when Redis rejects', () => {
  it('token blacklist: a failed lookup means "not revoked", not an error', async () => {
    vi.spyOn(redisApp, 'get').mockRejectedValue(down());
    vi.spyOn(redisApp, 'set').mockRejectedValue(down());

    await expect(isTokenRevoked('jti-1')).resolves.toBe(false);
    await expect(getCachedSessionVersion('user-1')).resolves.toBeNull();
    await expect(revokeToken('jti-1', Math.floor(Date.now() / 1000) + 60)).resolves.toBeUndefined();
  });

  it('rate limiter: lets the request through', async () => {
    vi.spyOn(redisApp, 'incr').mockRejectedValue(down());
    const next = vi.fn();
    const res = { setHeader: vi.fn(), status: vi.fn(), json: vi.fn() };

    await authRateLimit(
      { ip: '198.51.100.20' } as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('cache helper: falls back to the fetcher', async () => {
    vi.spyOn(redisApp, 'get').mockRejectedValue(down());
    vi.spyOn(redisApp, 'set').mockRejectedValue(down());
    const fetcher = vi.fn(async () => ({ ok: true }));

    await expect(cached('roles:list', 60, fetcher)).resolves.toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('login with the lockout store down', () => {
  it('still signs a user in, and a wrong password is a plain 401 (not a 500)', async () => {
    const { createApp } = await import('../app.js');
    const request = (await import('supertest')).default;
    const { createUser, DEFAULT_TEST_PASSWORD } = await import('../test/factories.js');
    const { user } = await createUser({ roleSlug: 'employee', email: 'redis-down@test.local' });

    for (const method of ['get', 'set', 'incr', 'expire', 'ttl', 'del'] as const) {
      vi.spyOn(redisApp, method).mockRejectedValue(down());
    }

    const app = createApp();
    const wrong = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'definitely-wrong' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.message).toBe('Invalid credentials');

    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: DEFAULT_TEST_PASSWORD });
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toBeTruthy();

    // An authenticated request also goes through (blacklist/session-version lookups fail open).
    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${ok.body.data.accessToken}`);
    expect(me.status).toBe(200);
  });
});
