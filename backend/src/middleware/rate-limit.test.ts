import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis.js';
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
  it('allows 20 requests per IP, then answers 429 with Retry-After', async () => {
    const req = { ip: '198.51.100.7' } as unknown as Request;
    const next = vi.fn();

    for (let i = 0; i < 20; i++) {
      const res = fakeRes();
      await authRateLimit(req, res as unknown as Response, next as unknown as NextFunction);
      expect(res.status).not.toHaveBeenCalled();
    }
    expect(next).toHaveBeenCalledTimes(20);

    const blocked = fakeRes();
    await authRateLimit(req, blocked as unknown as Response, next as unknown as NextFunction);

    expect(next).toHaveBeenCalledTimes(20);
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
    for (let i = 0; i < 20; i++) {
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
    expect(next).toHaveBeenCalledTimes(21);
  });

  it('falls back to the full window for Retry-After when the key has no usable ttl', async () => {
    const req = { ip: '198.51.100.9' } as unknown as Request;
    const next = vi.fn();
    for (let i = 0; i < 20; i++) {
      await authRateLimit(req, fakeRes() as unknown as Response, next as unknown as NextFunction);
    }

    const ttl = vi.spyOn(redis, 'ttl').mockResolvedValue(-1);
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
});
