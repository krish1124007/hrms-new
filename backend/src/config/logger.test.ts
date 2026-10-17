import { Writable } from 'node:stream';
import express from 'express';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { loggerOptions } from './logger.js';

/** A pino logger that uses the production options but writes into memory. */
function memoryLogger() {
  const lines: string[] = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(String(chunk));
      callback();
    },
  });
  // The dev-only pretty transport would spawn a worker — drop it for the test.
  const { transport: _transport, ...options } = loggerOptions as pino.LoggerOptions & {
    transport?: unknown;
  };
  return { log: pino({ ...options, level: 'info' }, destination), lines };
}

describe('logger redaction', () => {
  it('redacts the Authorization and Cookie request headers', () => {
    const { log, lines } = memoryLogger();

    log.info(
      { req: { method: 'GET', headers: { authorization: 'Bearer abc', cookie: 'x=y', accept: '*/*' } } },
      'request completed',
    );

    const output = lines.join('');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('Bearer abc');
    expect(output).not.toContain('abc');
    expect(output).not.toContain('x=y');

    const entry = JSON.parse(lines[0] ?? '{}') as {
      req: { headers: Record<string, string> };
    };
    expect(entry.req.headers.authorization).toBe('[REDACTED]');
    expect(entry.req.headers.cookie).toBe('[REDACTED]');
    // Non-sensitive headers are left alone.
    expect(entry.req.headers.accept).toBe('*/*');
  });

  it('redacts the metrics and CSRF tokens', () => {
    const { log, lines } = memoryLogger();

    log.info(
      {
        req: {
          headers: {
            'x-metrics-token': 'metrics-secret-value',
            'x-csrf-token': 'csrf-secret-value',
            'user-agent': 'vitest',
          },
        },
      },
      'request completed',
    );

    const output = lines.join('');
    expect(output).not.toContain('metrics-secret-value');
    expect(output).not.toContain('csrf-secret-value');
    const entry = JSON.parse(lines[0] ?? '{}') as { req: { headers: Record<string, string> } };
    expect(entry.req.headers['x-metrics-token']).toBe('[REDACTED]');
    expect(entry.req.headers['x-csrf-token']).toBe('[REDACTED]');
    expect(entry.req.headers['user-agent']).toBe('vitest');
  });

  it('redacts Set-Cookie on responses', () => {
    const { log, lines } = memoryLogger();

    log.info({ res: { statusCode: 200, headers: { 'set-cookie': ['refresh=secret-refresh-value'] } } }, 'done');

    const output = lines.join('');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('secret-refresh-value');
  });

  it('keeps bearer tokens and cookies out of the access log pino-http writes', async () => {
    const { log, lines } = memoryLogger();
    const app = express();
    app.use(pinoHttp({ logger: log }));
    app.get('/ping', (_req, res) => {
      res.cookie('refresh', 'secret-refresh-value', { httpOnly: true });
      res.json({ ok: true });
    });

    await request(app)
      .get('/ping')
      .set('Authorization', 'Bearer eyJhbGciOi.secret-access-token.sig')
      .set('Cookie', 'session=secret-session-cookie')
      .set('X-Metrics-Token', 'secret-metrics-token-value');

    const output = lines.join('');
    expect(output).toContain('"url":"/ping"');
    expect(output).toContain('[REDACTED]');
    expect(output).not.toContain('secret-access-token');
    expect(output).not.toContain('secret-session-cookie');
    expect(output).not.toContain('secret-metrics-token-value');
    expect(output).not.toContain('secret-refresh-value');
  });
});
