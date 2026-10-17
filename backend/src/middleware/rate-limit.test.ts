import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { redisApp } from '../config/redis.js';
import { authRateLimit } from './rate-limit.middleware.js';

function fakeRes() {
  const res = {
    setHeader: vi.fn(),
    status: vi.fn(),
    json: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res;
}

describe('authRateLimit', () => {
  it('allows 100 requests per IP (a shared office IP), then answers 429 with Retry-After', async () => {
    const req = { ip: '198.51.100.7' } as unknown as Request;
    const next = vi.fn();

    for (let i = 0; i < 100; i++) {
      const res = fakeRes();
      await authRateLimit(req, res as unknown as Response, next as unknown as NextFunction);
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(next).toHaveBeenCalledTimes(100);

    const blocked = fakeRes();
    await authRateLimit(req, blocked as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(100);
    expect(blocked.status).toHaveBeenCalledWith(429);
    expect(blocked.json).toHaveBeenCalledWith({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many requests. Please slow down.' },
    });

    const retryAfter = blocked.setHeader.mock.calls.find(([name]) => name === 'Retry-After');
    expect(retryAfter).toBeDefined();
    const seconds = Number(retryAfter![1]);
    expect(seconds).toBeGreaterThan(0);
    expect(seconds).toBeLessThanOrEqual(15 * 60);
  });

  it('counts each IP separately', async () => {
    const next = vi.fn();
    for (let i = 0; i < 100; i++) {
      await authRateLimit(
        { ip: '198.51.100.7' } as unknown as Request,
        fakeRes() as unknown as Response,
        next as unknown as NextFunction,
      );
    }
    const other = fakeRes();
    await authRateLimit(
      { ip: '198.51.100.8' } as unknown as Request,
      other as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(other.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(101);
  });

  it('falls back to the full window for Retry-After when the key has no usable ttl', async () => {
    const req = { ip: '198.51.100.9' } as unknown as Request;
    const next = vi.fn();
    for (let i = 0; i < 100; i++) {
      await authRateLimit(req, fakeRes() as unknown as Response, next as unknown as NextFunction);
    }

    const ttl = vi.spyOn(redisApp, 'ttl').mockResolvedValue(-1);
    try {
      const blocked = fakeRes();
      await authRateLimit(req, blocked as unknown as Response, next as unknown as NextFunction);

      expect(ttl).toHaveBeenCalledWith('ratelimit:auth:198.51.100.9');
      expect(blocked.status).toHaveBeenCalledWith(429);
      expect(blocked.setHeader).toHaveBeenCalledWith('Retry-After', '900');
    } finally {
      ttl.mockRestore();
    }
  });

  it('self-heals a counter that lost its expiry, so an IP is never blocked for good', async () => {
    // INCR and EXPIRE are two round trips: a crash between them leaves a
    // counter with no TTL that would keep the IP over the limit forever.
    const key = 'ratelimit:auth:198.51.100.10';
    await redisApp.set(key, '100');
    expect(await redisApp.ttl(key)).toBe(-1);

    const blocked = fakeRes();
    const next = vi.fn();
    await authRateLimit(
      { ip: '198.51.100.10' } as unknown as Request,
      blocked as unknown as Response,
      next as unknown as NextFunction,
    );
    expect(blocked.status).toHaveBeenCalledWith(429);

    const ttl = await redisApp.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(15 * 60);
  });
});
