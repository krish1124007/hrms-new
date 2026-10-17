import request from 'supertest';
import { describe, it, expect, afterEach } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';

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
