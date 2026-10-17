import request from 'supertest';
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { metricsGuard } from '../middleware/metrics-guard.middleware.js';

const METRICS_TOKEN = 'secret-metrics-token-123';
const PUBLIC_IP = '203.0.113.9';

describe('API docs gating', () => {
  it('does not serve Swagger UI or the OpenAPI JSON when exposeDocs is false', async () => {
    const app = createApp({ exposeDocs: false });

    const ui = await request(app).get('/api/docs');
    expect(ui.status).toBe(404);

    const json = await request(app).get('/api/docs.json');
    expect(json.status).toBe(404);
  });

  it('serves them when exposeDocs is true', async () => {
    const app = createApp({ exposeDocs: true });

    const json = await request(app).get('/api/docs.json');
    expect(json.status).toBe(200);
    expect(json.body.openapi ?? json.body.swagger).toBeTruthy();

    const ui = await request(app).get('/api/docs/').redirects(1);
    expect(ui.status).toBe(200);
  });

  it('exposes docs outside production by default (NODE_ENV=test)', async () => {
    const res = await request(createApp()).get('/api/docs.json');
    expect(res.status).toBe(200);
  });
});

describe('metrics gating', () => {
  it('refuses a non-loopback caller that has no token', async () => {
    const app = createApp({ metricsToken: METRICS_TOKEN });

    const res = await request(app).get('/api/metrics').set('X-Forwarded-For', PUBLIC_IP);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Metrics are restricted' },
    });
  });

  it('refuses a non-loopback caller with the wrong token', async () => {
    const app = createApp({ metricsToken: METRICS_TOKEN });

    const res = await request(app)
      .get('/api/metrics')
      .set('X-Forwarded-For', PUBLIC_IP)
      .set('x-metrics-token', 'not-the-right-token');

    expect(res.status).toBe(403);
  });

  it('allows a non-loopback caller that presents the configured token', async () => {
    const app = createApp({ metricsToken: METRICS_TOKEN });

    const res = await request(app)
      .get('/api/metrics')
      .set('X-Forwarded-For', PUBLIC_IP)
      .set('x-metrics-token', METRICS_TOKEN);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])(
    'allows a forwarded loopback client (%s) arriving over the loopback socket',
    async (forwarded) => {
      const app = createApp({ metricsToken: METRICS_TOKEN });

      const res = await request(app).get('/api/metrics').set('X-Forwarded-For', forwarded);

      expect(res.status).toBe(200);
    },
  );

  it('allows loopback callers without a token', async () => {
    const app = createApp({ metricsToken: METRICS_TOKEN });

    const res = await request(app).get('/api/metrics');

    expect(res.status).toBe(200);
  });

  it('does not accept an empty token when none is configured', async () => {
    const app = createApp({ metricsToken: undefined });

    const res = await request(app)
      .get('/api/metrics')
      .set('X-Forwarded-For', PUBLIC_IP)
      .set('x-metrics-token', '');

    expect(res.status).toBe(403);
  });

  it('keeps the health probes public', async () => {
    const app = createApp({ metricsToken: METRICS_TOKEN });

    for (const path of ['/api/health', '/api/v1/health']) {
      const res = await request(app).get(path).set('X-Forwarded-For', PUBLIC_IP);
      expect(res.status, path).toBe(200);
    }
    const ready = await request(app).get('/api/readyz').set('X-Forwarded-For', PUBLIC_IP);
    expect([200, 503]).toContain(ready.status);
  });
});

describe('metricsGuard socket check', () => {
  // supertest always connects over loopback, so a request whose TCP peer is a
  // remote address while X-Forwarded-For claims loopback can only be exercised
  // by handing the middleware a hand-built request.
  function run(opts: { ip?: string; remote?: string; token?: string }, configured?: string) {
    const req = {
      ip: opts.ip,
      socket: { remoteAddress: opts.remote },
      get: (name: string) => (name.toLowerCase() === 'x-metrics-token' ? opts.token : undefined),
    } as unknown as Request;
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    const next = vi.fn();
    metricsGuard(configured)(req, res as unknown as Response, next as unknown as NextFunction);
    return { res, next };
  }

  it('lets a request through only when req.ip AND the socket peer are loopback', () => {
    const { next, res } = run({ ip: '127.0.0.1', remote: '::ffff:127.0.0.1' }, METRICS_TOKEN);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a spoofed X-Forwarded-For: 127.0.0.1 from a remote socket', () => {
    const { next, res } = run({ ip: '127.0.0.1', remote: '203.0.113.9' }, METRICS_TOKEN);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('rejects a remote client forwarded by a local proxy when it has no token', () => {
    const { next, res } = run({ ip: '203.0.113.9', remote: '127.0.0.1' }, METRICS_TOKEN);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('still honours the token when the loopback check fails', () => {
    const spoofed = run({ ip: '127.0.0.1', remote: '203.0.113.9', token: METRICS_TOKEN }, METRICS_TOKEN);
    expect(spoofed.next).toHaveBeenCalledTimes(1);

    const wrong = run({ ip: '127.0.0.1', remote: '203.0.113.9', token: 'nope' }, METRICS_TOKEN);
    expect(wrong.next).not.toHaveBeenCalled();
    expect(wrong.res.status).toHaveBeenCalledWith(403);
  });

  it('treats a missing socket address as non-loopback', () => {
    const { next, res } = run({ ip: '127.0.0.1', remote: undefined }, METRICS_TOKEN);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

describe('production defaults', () => {
  // `createApp()` reads env when it is called, so flipping the parsed config
  // for the duration of a test exercises the real default (no opts passed).
  const saved = { NODE_ENV: env.NODE_ENV, ENABLE_API_DOCS: env.ENABLE_API_DOCS };

  afterEach(() => {
    env.NODE_ENV = saved.NODE_ENV;
    env.ENABLE_API_DOCS = saved.ENABLE_API_DOCS;
  });

  it('hides docs and restricts metrics with NODE_ENV=production and ENABLE_API_DOCS=false', async () => {
    env.NODE_ENV = 'production';
    env.ENABLE_API_DOCS = 'false';
    const app = createApp();

    expect((await request(app).get('/api/docs')).status).toBe(404);
    expect((await request(app).get('/api/docs/')).status).toBe(404);
    expect((await request(app).get('/api/docs.json')).status).toBe(404);
    expect((await request(app).get('/api/metrics').set('X-Forwarded-For', PUBLIC_IP)).status).toBe(
      403,
    );
  });

  it('serves docs in production once ENABLE_API_DOCS=true', async () => {
    env.NODE_ENV = 'production';
    env.ENABLE_API_DOCS = 'true';
    const app = createApp();

    expect((await request(app).get('/api/docs.json')).status).toBe(200);
  });
});
