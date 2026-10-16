import express from 'express';
import request from 'supertest';
import { describe, it, expect } from 'vitest';
import { presignResponse, unsignRequestBody } from './presign-response.middleware.js';
import { signFileUrl, verifyFileSignature } from '../lib/file-urls.js';

/** Bare app: JSON parser + the middleware under test + one route answering `body`. */
function appAnswering(body: unknown) {
  const app = express();
  app.use(express.json());
  app.use(presignResponse);
  app.get('/t', (_req, res) => {
    res.json(body);
  });
  return app;
}

function expectSigned(value: unknown, key: string) {
  expect(typeof value).toBe('string');
  const url = new URL(value as string); // throws if not absolute
  expect(url.pathname).toBe(`/api/v1/files/${key}`);
  expect(value).toContain('exp=');
  expect(value).toContain('sig=');
  const exp = url.searchParams.get('exp') ?? '';
  const sig = url.searchParams.get('sig') ?? '';
  expect(verifyFileSignature(key, exp, sig)).toBe(true);
}

describe('presignResponse', () => {
  it('rewrites nested legacy /uploads/ strings and leaves others alone', async () => {
    const res = await request(
      appAnswering({ a: { url: '/uploads/x.pdf' }, b: ['/uploads/y.png', 'plain'], n: 3, z: null }),
    ).get('/t');

    expect(res.status).toBe(200);
    expectSigned(res.body.a.url, 'x.pdf');
    expectSigned(res.body.b[0], 'y.png');
    expect(res.body.b[1]).toBe('plain');
    expect(res.body.n).toBe(3);
    expect(res.body.z).toBeNull();
  });

  it('only rewrites strings that start with /uploads/', async () => {
    const res = await request(
      appAnswering({ note: 'see /uploads/x.pdf', path: 'uploads/x.pdf', abs: 'https://cdn.example.com/uploads/x.pdf' }),
    ).get('/t');

    expect(res.body).toEqual({
      note: 'see /uploads/x.pdf',
      path: 'uploads/x.pdf',
      abs: 'https://cdn.example.com/uploads/x.pdf',
    });
  });

  it('serialises toJSON values (Mongoose documents, Dates) before walking them', async () => {
    const doc = { toJSON: () => ({ file: { url: '/uploads/docs/a.pdf' } }) };
    const when = new Date('2026-05-01T00:00:00Z');
    const res = await request(appAnswering({ data: [doc], when })).get('/t');

    expectSigned(res.body.data[0].file.url, 'docs/a.pdf');
    expect(res.body.when).toBe('2026-05-01T00:00:00.000Z');
  });

  it('passes non-object bodies through untouched', async () => {
    const res = await request(appAnswering('/uploads/x.pdf')).get('/t');
    expect(res.body).toBe('/uploads/x.pdf');
  });
});

describe('unsignRequestBody', () => {
  it('turns signed file URLs in a JSON body back into their stored /uploads/ form', async () => {
    let seen: unknown;
    const app = express();
    app.use(express.json());
    app.use(unsignRequestBody);
    app.post('/t', (req, res) => {
      seen = req.body;
      res.status(204).end();
    });

    const signed = signFileUrl('/uploads/documents/2026/05/receipt one.pdf');
    const forged = signed.replace('receipt%20one.pdf', 'other.pdf');
    await request(app)
      .post('/t')
      .send({ receiptUrls: [{ name: 'r', fileUrl: signed }], forged, other: 'plain' })
      .expect(204);

    expect(seen).toEqual({
      receiptUrls: [{ name: 'r', fileUrl: '/uploads/documents/2026/05/receipt one.pdf' }],
      forged, // signature does not match → left exactly as sent
      other: 'plain',
    });
  });
});
