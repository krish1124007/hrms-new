import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';
import { registry } from '../lib/metrics.js';

describe('createApp', () => {
  it('serves health at /api/v1/health and returns the standard 404 envelope', async () => {
    const app = createApp();
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });

  it('exposes only /health at the /api/v1 prefix; readyz and metrics stay under /api', async () => {
    const app = createApp();

    expect((await request(app).get('/api/v1/health')).status).toBe(200);
    expect((await request(app).get('/api/v1/readyz')).status).toBe(404);
    expect((await request(app).get('/api/v1/metrics')).status).toBe(404);

    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/api/readyz')).status).toBe(200);
    expect((await request(app).get('/api/metrics')).status).toBe(200);
  });

  it('does not count its own health, readiness and metrics probes in request metrics', async () => {
    const app = createApp();
    const probes = ['/api/health', '/api/v1/health', '/api/readyz', '/api/metrics'];
    for (const probe of probes) await request(app).get(probe);
    // Positive control: an ordinary request must still be counted.
    await request(app).get('/api/v1/metrics-control');

    const exposition = await registry.metrics();
    expect(exposition).toContain('route="/api/v1/metrics-control"');
    for (const probe of probes) expect(exposition).not.toContain(`route="${probe}"`);
  });
});
