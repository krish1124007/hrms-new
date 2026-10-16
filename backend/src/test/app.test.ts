import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { createApp } from '../app.js';

describe('createApp', () => {
  it('serves health at /api/v1/health and returns the standard 404 envelope', async () => {
    const app = createApp();
    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
    const missing = await request(app).get('/api/v1/does-not-exist');
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
