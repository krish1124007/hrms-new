import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { env } from '../config/env.js';
import { signFileUrl } from '../lib/file-urls.js';
import { uploadRoot } from '../lib/local-storage.js';
import { Backup } from '../models/backup.model.js';
import { SystemSetting } from '../models/system-setting.model.js';
import { enqueueBackupCreate, enqueueBackupRestore, setMonthlyBackupSchedule } from '../jobs/backup.jobs.js';
import { createUser } from '../test/factories.js';

const BACKUP_DIR = path.resolve(process.env.BACKUP_DIR!);
const LEGACY_DIR = path.join(uploadRoot(), 'backups');
const created: string[] = []; // fixture files to remove afterwards
const GZIP_BYTES = Buffer.from([0x1f, 0x8b, 0x08, 0x00, 0x01, 0x02, 0x03, 0x04]);

/** Write a fixture file and remember it for clean-up. */
function writeFixture(dir: string, name: string, body: Buffer | string = GZIP_BYTES): string {
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, body);
  created.push(abs);
  return abs;
}

function uniqueName(): string {
  return `2026-10-17-${randomUUID()}.tar.gz`;
}

async function completedBackup(fields: Record<string, unknown>) {
  return Backup.create({ type: 'database', status: 'completed', size: GZIP_BYTES.length, ...fields });
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let savedScratchUri: string | undefined;
beforeAll(() => {
  savedScratchUri = env.BACKUP_SCRATCH_MONGO_URI;
});
afterEach(() => {
  env.BACKUP_SCRATCH_MONGO_URI = savedScratchUri;
});
afterAll(() => {
  for (const abs of created) fs.rmSync(abs, { force: true });
});

describe('backup API permissions', () => {
  it('403 for an employee on every backup route, and nothing is enqueued', async () => {
    const app = createApp();
    const { token } = await createUser({ roleSlug: 'employee' });
    const backup = await completedBackup({ fileName: 'x.tar.gz' });
    const id = String(backup._id);

    const list = await request(app).get('/api/v1/backups').set(auth(token));
    expect(list.status).toBe(403);
    const create = await request(app).post('/api/v1/backups').set(auth(token)).send({});
    expect(create.status).toBe(403);

    const others = {
      'GET /schedule': request(app).get('/api/v1/backups/schedule').set(auth(token)),
      'PUT /schedule': request(app).put('/api/v1/backups/schedule').set(auth(token)).send({ enabled: false }),
      'POST /:id/restore': request(app).post(`/api/v1/backups/${id}/restore`).set(auth(token)).send({}),
      'DELETE /:id': request(app).delete(`/api/v1/backups/${id}`).set(auth(token)),
      'GET /:id/download': request(app).get(`/api/v1/backups/${id}/download`).set(auth(token)),
    };
    for (const [label, pending] of Object.entries(others)) {
      expect((await pending).status, label).toBe(403);
    }

    expect(enqueueBackupCreate).not.toHaveBeenCalled();
    expect(enqueueBackupRestore).not.toHaveBeenCalled();
    expect(setMonthlyBackupSchedule).not.toHaveBeenCalled();
    expect(await Backup.countDocuments()).toBe(1);
    expect((await Backup.findById(id).lean())?.deletedAt).toBeNull();
  });

  it('401 without a token', async () => {
    const res = await request(createApp()).get('/api/v1/backups');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/v1/backups', () => {
  it('lists rows with a downloadUrl and never a fileUrl', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const current = await completedBackup({ fileName: uniqueName() });
    const legacy = await completedBackup({ fileUrl: '/uploads/backups/legacy-row.tar.gz' });
    const running = await Backup.create({ type: 'database', status: 'in_progress' });

    const res = await request(createApp()).get('/api/v1/backups').set(auth(token));
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row).not.toHaveProperty('fileUrl');

    const byId = new Map(rows.map((r) => [r._id, r]));
    expect(byId.get(String(current._id))?.downloadUrl).toBe(`/api/v1/backups/${String(current._id)}/download`);
    expect(byId.get(String(legacy._id))?.downloadUrl).toBe(`/api/v1/backups/${String(legacy._id)}/download`);
    expect(byId.get(String(running._id))?.downloadUrl).toBeNull();

    // Nothing in the payload is a stored upload reference or a signed file link.
    expect(res.text).not.toContain('/uploads/');
    expect(res.text).not.toContain('/api/v1/files/');
  });

  it('POST returns the queued row without a fileUrl', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const res = await request(createApp()).post('/api/v1/backups').set(auth(token)).send({});
    expect(res.status).toBe(201);
    expect(res.body.data).not.toHaveProperty('fileUrl');
    expect(res.body.data.downloadUrl).toBeNull();
    expect(enqueueBackupCreate).toHaveBeenCalledWith(res.body.data._id);
  });
});

describe('POST /api/v1/backups/:id/restore', () => {
  it('400 RESTORE_TARGET_NOT_CONFIGURED when BACKUP_SCRATCH_MONGO_URI is unset', async () => {
    env.BACKUP_SCRATCH_MONGO_URI = undefined;
    const { token } = await createUser({ roleSlug: 'admin' });
    const backup = await completedBackup({ fileName: 'x.tar.gz' });

    const res = await request(createApp())
      .post(`/api/v1/backups/${String(backup._id)}/restore`)
      .set(auth(token))
      .send({ scratchMongoUri: 'mongodb://attacker.example:27017/anything' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('RESTORE_TARGET_NOT_CONFIGURED');
    expect(enqueueBackupRestore).not.toHaveBeenCalled();
  });

  it('400 UNSAFE_RESTORE_TARGET when the configured target is the live database', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const backup = await completedBackup({ fileName: 'x.tar.gz' });
    const app = createApp();

    const live = new URL(env.MONGODB_URI);
    const sameDbElsewhere = new URL(env.MONGODB_URI);
    sameDbElsewhere.host = 'scratch-host.example:27017';
    const noDatabase = new URL(env.MONGODB_URI);
    noDatabase.pathname = '/';

    for (const target of [env.MONGODB_URI, sameDbElsewhere.toString(), noDatabase.toString()]) {
      env.BACKUP_SCRATCH_MONGO_URI = target;
      const res = await request(app)
        .post(`/api/v1/backups/${String(backup._id)}/restore`)
        .set(auth(token))
        .send({});
      expect(res.status, target).toBe(400);
      expect(res.body.error.code, target).toBe('UNSAFE_RESTORE_TARGET');
    }
    expect(live.pathname.length).toBeGreaterThan(1); // the live URI names its database
    expect(enqueueBackupRestore).not.toHaveBeenCalled();
  });

  it('enqueues only the backup id when a scratch target is configured (body is ignored)', async () => {
    const scratch = new URL(env.MONGODB_URI);
    scratch.pathname = '/hrms_restore_scratch_test';
    env.BACKUP_SCRATCH_MONGO_URI = scratch.toString();
    const { token } = await createUser({ roleSlug: 'admin' });
    const backup = await completedBackup({ fileName: 'x.tar.gz' });

    const res = await request(createApp())
      .post(`/api/v1/backups/${String(backup._id)}/restore`)
      .set(auth(token))
      .send({ scratchMongoUri: 'mongodb://attacker.example:27017/x"; rm -rf / #' });
    expect(res.status).toBe(200);
    expect(enqueueBackupRestore).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enqueueBackupRestore).mock.calls[0]).toEqual([String(backup._id)]);
  });
});

describe('PUT /api/v1/backups/schedule', () => {
  it('persists the toggle to SystemSetting before applying it', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const app = createApp();

    const off = await request(app).put('/api/v1/backups/schedule').set(auth(token)).send({ enabled: false });
    expect(off.status).toBe(200);
    expect(await SystemSetting.findOne({ key: 'backup.monthlyEnabled' }).lean()).toMatchObject({ value: false });
    expect(setMonthlyBackupSchedule).toHaveBeenLastCalledWith(false);

    const on = await request(app).put('/api/v1/backups/schedule').set(auth(token)).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(await SystemSetting.findOne({ key: 'backup.monthlyEnabled' }).lean()).toMatchObject({ value: true });
    expect(await SystemSetting.countDocuments({ key: 'backup.monthlyEnabled' })).toBe(1);
    expect(setMonthlyBackupSchedule).toHaveBeenLastCalledWith(true);
  });
});

describe('GET /api/v1/backups/:id/download', () => {
  it('streams the tarball from BACKUP_DIR as an attachment', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const name = uniqueName();
    writeFixture(BACKUP_DIR, name);
    const backup = await completedBackup({ fileName: name });

    const res = await request(createApp())
      .get(`/api/v1/backups/${String(backup._id)}/download`)
      .set(auth(token))
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/gzip');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${name}"`);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(Buffer.from(res.body)).toEqual(GZIP_BYTES);
  });

  it('serves a not-yet-relocated legacy row from <UPLOAD_DIR>/backups/', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const name = `legacy-${randomUUID()}.tar.gz`;
    writeFixture(LEGACY_DIR, name, 'legacy tarball');
    const backup = await completedBackup({ fileUrl: `/uploads/backups/${name}` });

    const res = await request(createApp())
      .get(`/api/v1/backups/${String(backup._id)}/download`)
      .set(auth(token))
      .responseType('blob');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe(`attachment; filename="${name}"`);
    expect(Buffer.from(res.body).toString()).toBe('legacy tarball');
  });

  it('404 when the row or its file is missing', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const app = createApp();
    const noFile = await completedBackup({ fileName: uniqueName() });
    const running = await Backup.create({ type: 'database', status: 'in_progress' });

    for (const id of [String(noFile._id), String(running._id), '64b7f0c2a1b2c3d4e5f60718']) {
      const res = await request(app).get(`/api/v1/backups/${id}/download`).set(auth(token));
      expect(res.status, id).toBe(404);
    }
  });

  it('404 for stored names that are not bare basenames (no traversal)', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const app = createApp();
    // A real file one level above BACKUP_DIR and one above the legacy dir.
    const outside = `outside-${randomUUID()}.tar.gz`;
    writeFixture(path.dirname(BACKUP_DIR), outside);
    writeFixture(uploadRoot(), outside);

    const rows = await Promise.all([
      completedBackup({ fileName: `../${outside}` }),
      completedBackup({ fileName: `..\\${outside}` }),
      completedBackup({ fileName: `sub/${outside}` }),
      completedBackup({ fileUrl: `/uploads/backups/../${outside}` }),
      completedBackup({ fileUrl: `/uploads/${outside}` }),
    ]);
    for (const row of rows) {
      const res = await request(app).get(`/api/v1/backups/${String(row._id)}/download`).set(auth(token));
      expect(res.status, JSON.stringify(row.toObject())).toBe(404);
    }
  });
});

describe('DELETE /api/v1/backups/:id', () => {
  it('removes the tarball and its counts sidecar, then soft-deletes the row', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const name = uniqueName();
    const tarball = writeFixture(BACKUP_DIR, name);
    const counts = writeFixture(BACKUP_DIR, name.replace(/\.tar\.gz$/, '.counts.json'), '{}');
    const backup = await completedBackup({ fileName: name });

    const res = await request(createApp()).delete(`/api/v1/backups/${String(backup._id)}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(fs.existsSync(tarball)).toBe(false);
    expect(fs.existsSync(counts)).toBe(false);
    expect(await Backup.findById(backup._id).lean()).toBeNull(); // hidden once soft-deleted
    const raw = await Backup.findById(backup._id).setOptions({ withDeleted: true }).lean<{ isDeleted?: boolean }>();
    expect(raw?.isDeleted).toBe(true);
  });

  it('removes a legacy row’s files from <UPLOAD_DIR>/backups/', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const name = `legacy-${randomUUID()}.tar.gz`;
    const tarball = writeFixture(LEGACY_DIR, name);
    const counts = writeFixture(LEGACY_DIR, name.replace(/\.tar\.gz$/, '.counts.json'), '{}');
    const backup = await completedBackup({ fileUrl: `/uploads/backups/${name}` });

    const res = await request(createApp()).delete(`/api/v1/backups/${String(backup._id)}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(fs.existsSync(tarball)).toBe(false);
    expect(fs.existsSync(counts)).toBe(false);
  });

  it('still soft-deletes a row whose file is already gone', async () => {
    const { token } = await createUser({ roleSlug: 'admin' });
    const backup = await completedBackup({ fileName: uniqueName() });
    const res = await request(createApp()).delete(`/api/v1/backups/${String(backup._id)}`).set(auth(token));
    expect(res.status).toBe(200);
    expect(await Backup.countDocuments()).toBe(0);
  });
});

describe('legacy backups and the signed files route', () => {
  it('never serves <UPLOAD_DIR>/backups/ even with a valid signature', async () => {
    const name = `legacy-${randomUUID()}.tar.gz`;
    writeFixture(LEGACY_DIR, name);
    const signed = signFileUrl(`/uploads/backups/${name}`).replace(/^https?:\/\/[^/]+/, '');
    const res = await request(createApp()).get(signed);
    expect(res.status).toBe(404);
  });
});

