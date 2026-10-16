import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import compression from 'compression';
import request from 'supertest';
import { compressionTelemetry } from './compression-telemetry.middleware.js';

describe('compressionTelemetry', () => {
  let dir: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ct-'));
    fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(64 * 1024));
  });

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('does not crash when a static file is streamed (headers already sent at end())', async () => {
    const app = express();
    app.use(compressionTelemetry);
    app.use(express.static(dir));

    // Before the fix, setHeader() threw ERR_HTTP_HEADERS_SENT inside the file
    // stream's end() callback, surfacing as an uncaughtException.
    const uncaught = vi.fn();
    process.once('uncaughtException', uncaught);
    try {
      const res = await request(app).get('/big.txt').buffer(true).parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
      // Let any error thrown from a stream callback surface before we assert.
      await new Promise((resolve) => setImmediate(resolve));

      expect(res.status).toBe(200);
      expect((res.body as Buffer).length).toBe(64 * 1024);
      expect(uncaught).not.toHaveBeenCalled();
    } finally {
      process.removeListener('uncaughtException', uncaught);
    }
  });

  it('still emits X-Compression-Ratio for a normal response with Content-Length', async () => {
    const app = express();
    app.use(compression());
    app.use(compressionTelemetry);
    app.get('/json', (_req, res) => {
      res.json({ ok: true });
    });

    const res = await request(app).get('/json');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-compression-ratio']).toMatch(/^\d+\/\d+$/);
  });
});
