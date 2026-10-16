import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createApp } from '../app.js';
import { signFileUrl } from '../lib/file-urls.js';
import { deleteFile, uploadRoot } from '../lib/local-storage.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { Employee } from '../models/employee.model.js';
import { DocumentModel } from '../models/document.model.js';
import { AuditLog } from '../models/audit-log.model.js';

const FIXTURE_DIR = 'files-route-test';
const SIBLING_DIR = `${uploadRoot()}-sibling`; // shares UPLOAD_DIR's name as a prefix
const uploadedKeys: string[] = []; // files the API wrote during these tests

/** The path + query of an absolute signed URL, without letting a URL parser collapse `..`. */
function pathAndQuery(signed: string): string {
  return signed.replace(/^https?:\/\/[^/]+/, '');
}

beforeAll(() => {
  const dir = path.join(uploadRoot(), FIXTURE_DIR);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'evil.html'), '<script>alert(document.cookie)</script>');
  fs.writeFileSync(path.join(dir, 'payslip.pdf'), '%PDF-1.4 fake');
  fs.writeFileSync(path.join(dir, 'वेतन "पर्ची".pdf'), '%PDF-1.4 unicode');
  fs.mkdirSync(SIBLING_DIR, { recursive: true });
  fs.writeFileSync(path.join(SIBLING_DIR, 'secret.txt'), 'outside the upload root');
});

afterAll(async () => {
  fs.rmSync(path.join(uploadRoot(), FIXTURE_DIR), { recursive: true, force: true });
  fs.rmSync(SIBLING_DIR, { recursive: true, force: true });
  await Promise.all(uploadedKeys.map(deleteFile));
});

describe('GET /api/v1/files/*', () => {
  it('401 without a signature', async () => {
    const res = await request(createApp()).get(`/api/v1/files/${FIXTURE_DIR}/evil.html`);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      error: { code: 'INVALID_FILE_SIGNATURE', message: 'File link is invalid or has expired' },
    });
  });

  it('401 with a signature for a different key or an expired signature', async () => {
    const app = createApp();
    const other = pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/payslip.pdf`));
    const swapped = other.replace('payslip.pdf', 'evil.html');
    expect((await request(app).get(swapped)).status).toBe(401);

    const expired = pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/evil.html`, -1));
    const res = await request(app).get(expired);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_FILE_SIGNATURE');
  });

  it('200 + attachment for .html with a valid signature', async () => {
    const res = await request(createApp()).get(
      pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/evil.html`)),
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/html/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="evil\.html"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.text).toBe('<script>alert(document.cookie)</script>');
  });

  it('200 + inline for .pdf', async () => {
    const res = await request(createApp())
      .get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/payslip.pdf`)))
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="payslip\.pdf"/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body).toString()).toBe('%PDF-1.4 fake');
  });

  it('serves non-ASCII file names with an ASCII-safe filename and a UTF-8 filename*', async () => {
    const res = await request(createApp())
      .get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/वेतन "पर्ची".pdf`)))
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(
      `inline; filename="____ _______.pdf"; filename*=UTF-8''${encodeURIComponent('वेतन "पर्ची".pdf')}`,
    );
  });

  it('404 for path traversal', async () => {
    const app = createApp();
    // Encoded so no client/URL parser collapses the dot segments before the route sees them.
    const encoded = pathAndQuery(signFileUrl('../../etc/passwd')).replace(
      '/api/v1/files/../../etc/passwd',
      '/api/v1/files/..%2F..%2Fetc%2Fpasswd',
    );
    const res = await request(app).get(encoded);
    expect(res.status).toBe(404);
    expect(res.body.error).toMatchObject({ code: 'NOT_FOUND', message: 'File not found' });

    // A sibling directory whose name merely starts with the upload root's name.
    const sibling = `../${path.basename(SIBLING_DIR)}/secret.txt`;
    const siblingPath = pathAndQuery(signFileUrl(sibling)).replace(
      `/api/v1/files/${sibling}`,
      `/api/v1/files/${encodeURIComponent(sibling)}`,
    );
    const res2 = await request(app).get(siblingPath);
    expect(res2.status).toBe(404);
    expect(res2.body.error?.message).toBe('File not found');
  });

  it('404 for a missing file or a directory', async () => {
    const app = createApp();
    const missing = await request(app).get(
      pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/nope.pdf`)),
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.message).toBe('File not found');

    const dir = await request(app).get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}`)));
    expect(dir.status).toBe(404);
  });

  it('does not write an audit row for an invalid or expired link (anonymous route)', async () => {
    const app = createApp();
    expect(await AuditLog.countDocuments()).toBe(0);

    const unsigned = await request(app).get(`/api/v1/files/${FIXTURE_DIR}/evil.html`);
    expect(unsigned.status).toBe(401);
    const expired = await request(app).get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/evil.html`, -1)));
    expect(expired.status).toBe(401);

    // Positive control: a 404 from the same route IS audited. Once its row has
    // landed, any row from the earlier (fire-and-forget) 401s would have too.
    const missing = await request(app).get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/nope.pdf`)));
    expect(missing.status).toBe(404);
    await vi.waitFor(async () => expect(await AuditLog.countDocuments()).toBeGreaterThanOrEqual(1));

    const rows = await AuditLog.find().lean();
    expect(rows.map((r) => r.metadata?.code)).toEqual(['NOT_FOUND']);
  });

  it('no longer serves /uploads statically', async () => {
    const res = await request(createApp()).get(`/uploads/${FIXTURE_DIR}/payslip.pdf`);
    expect(res.status).toBe(404);
  });
});

describe('uploads through the API', () => {
  it('returns a signed URL from POST /documents/upload that downloads without auth', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });

    const upload = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('name,amount\nA,1\n'), { filename: 'report.csv', contentType: 'text/csv' });
    expect(upload.status).toBe(201);

    const url: string = upload.body.data.file.url;
    expect(url).toMatch(/^http:\/\/localhost:4000\/api\/v1\/files\/documents\/.+-report\.csv\?exp=\d+&sig=[0-9a-f]{64}$/);

    const download = await request(app).get(pathAndQuery(url)); // no Authorization header
    expect(download.status).toBe(200);
    expect(download.headers['content-disposition']).toMatch(/^attachment/);
    expect(download.text).toBe('name,amount\nA,1\n');

    // The stored value is still the legacy /uploads/<key> form.
    const stored = await DocumentModel.findById(upload.body.data._id).lean();
    uploadedKeys.push(stored!.file.key);
    expect(stored?.file.url).toMatch(/^\/uploads\/documents\/.+-report\.csv$/);
  });

  it('rejects disallowed upload types with 400 UNSUPPORTED_FILE_TYPE', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });

    const html = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<script>1</script>'), { filename: 'evil.html', contentType: 'text/html' });
    expect(html.status).toBe(400);
    expect(html.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    // An allowed extension does not excuse a disallowed declared type.
    const disguised = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('<script>1</script>'), { filename: 'evil.pdf', contentType: 'text/html' });
    expect(disguised.status).toBe(400);
    expect(disguised.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    expect(await DocumentModel.countDocuments()).toBe(0);
  });

  it('stores the /uploads/ form when a client posts back a signed URL it was given', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });
    const { user: staff } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(staff);

    const upload = await request(app)
      .post('/api/v1/documents/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('%PDF-1.4 id'), { filename: 'id proof.pdf', contentType: 'application/pdf' });
    expect(upload.status).toBe(201);
    const signedUrl: string = upload.body.data.file.url;
    const stored = (await DocumentModel.findById(upload.body.data._id).lean())!;
    uploadedKeys.push(stored.file.key);
    const storedUrl = stored.file.url;

    const added = await request(app)
      .post(`/api/v1/employees/${String(employee._id)}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'id_proof', name: 'ID proof', fileUrl: signedUrl });
    expect(added.status).toBe(201);
    expect(added.body.data[0].fileUrl).toMatch(/^http:\/\/localhost:4000\/api\/v1\/files\//);

    const reloaded = await Employee.findById(employee._id).lean();
    expect(reloaded?.documents[0]?.fileUrl).toBe(storedUrl);
    const doc = await DocumentModel.findById(upload.body.data._id).lean();
    expect(doc?.sharedWith.map((s) => String(s.userId))).toContain(String(staff._id));
  });

  it('rejects raw /uploads/ references in multipart text fields', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });

    for (const [field, value] of [
      ['name', '/uploads/evil'],
      ['folder', 'uploads/backups'], // normaliseFolder would turn this into /uploads/backups
    ] as const) {
      const res = await request(app)
        .post('/api/v1/documents/upload')
        .set('Authorization', `Bearer ${token}`)
        .field(field, value)
        .attach('file', Buffer.from('a,b\n'), { filename: 'ok.csv', contentType: 'text/csv' });
      expect(res.status, `${field}=${value}`).toBe(400);
      expect(res.body.error.code).toBe('INVALID_FILE_REFERENCE');
    }
    expect(await DocumentModel.countDocuments()).toBe(0);
  });

  it('rejects a raw /uploads/ reference in a JSON body and stores nothing', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'admin' });
    const { user: staff } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(staff);

    const res = await request(app)
      .post(`/api/v1/employees/${String(employee._id)}/documents`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'payslip', name: 'peek', fileUrl: '/uploads/payslips/2026-05/EMP001.pdf' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FILE_REFERENCE');
    expect((await Employee.findById(employee._id).lean())?.documents).toHaveLength(0);

    // Not audited either (positive control as in the files-route audit test).
    await request(app).get(pathAndQuery(signFileUrl(`/uploads/${FIXTURE_DIR}/nope.pdf`)));
    await vi.waitFor(async () => expect(await AuditLog.countDocuments()).toBeGreaterThanOrEqual(1));
    expect((await AuditLog.find().lean()).map((r) => r.metadata?.code)).toEqual(['NOT_FOUND']);
  });
});
