/**
 * Idempotency middleware: a retry that slips in between the first request's
 * cache write and its own cache read must replay, not run the handler again.
 */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi } from 'vitest';
import { redisApp } from '../config/redis.js';
import { idempotent } from './idempotency.middleware.js';

function appWithCounter() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as unknown as { user: { _id: string } }).user = { _id: 'user-1' };
    next();
  });
  let calls = 0;
  app.post('/pay', idempotent(), (_req, res) => {
    calls += 1;
    res.status(201).json({ success: true, data: { n: calls } });
  });
  return { app, calls: () => calls };
}

describe('idempotent()', () => {
  it('replays a repeat without running the handler again', async () => {
    const { app, calls } = appWithCounter();
    const first = await request(app).post('/pay').set('Idempotency-Key', 'key-00000001').send({ amount: 1 });
    const second = await request(app).post('/pay').set('Idempotency-Key', 'key-00000001').send({ amount: 1 });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers['x-idempotency-replay']).toBe('true');
    expect(second.body).toEqual(first.body);
    expect(calls()).toBe(1);
  });

  it('re-reads the cache after taking the lock: a first request that finished in between is replayed', async () => {
    const { app, calls } = appWithCounter();
    const first = await request(app).post('/pay').set('Idempotency-Key', 'key-00000002').send({ amount: 1 });
    expect(first.status).toBe(201);

    // The retry's first read happened before the first request cached its
    // response (it sees nothing); by the time it holds the lock, the cache is there.
    const spy = vi.spyOn(redisApp, 'get').mockResolvedValueOnce(null);
    try {
      const retry = await request(app).post('/pay').set('Idempotency-Key', 'key-00000002').send({ amount: 1 });
      expect(retry.status).toBe(201);
      expect(retry.headers['x-idempotency-replay']).toBe('true');
      expect(retry.body).toEqual(first.body);
    } finally {
      spy.mockRestore();
    }
    expect(calls()).toBe(1);

    // The lock was released: a later repeat still replays.
    const later = await request(app).post('/pay').set('Idempotency-Key', 'key-00000002').send({ amount: 1 });
    expect(later.headers['x-idempotency-replay']).toBe('true');
    expect(calls()).toBe(1);
  });
});
