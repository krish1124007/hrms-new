import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { uploadRoot } from './local-storage.js';
import { backupRoot, isSafeBackupName, legacyBackupRoot, locateBackupFiles, restoreTargetProblem } from './backups.js';

describe('backup locations', () => {
  it('BACKUP_DIR comes from env and is not inside the upload root', () => {
    expect(backupRoot()).toBe(path.resolve(process.env.BACKUP_DIR!));
    expect(legacyBackupRoot()).toBe(path.join(uploadRoot(), 'backups'));
    expect(backupRoot().startsWith(uploadRoot() + path.sep)).toBe(false);
  });

  it('accepts only bare basenames', () => {
    expect(isSafeBackupName('2026-10-17-abc.tar.gz')).toBe(true);
    for (const bad of [
      '',
      '.',
      '..',
      '../x.tar.gz',
      'a/b.tar.gz',
      'a\\b.tar.gz',
      'x..tar.gz',
      '/etc/passwd',
      'a\0b',
      // nothing that could break out of a quoted header value or look like an option
      'a"b.tar.gz',
      'a\r\nSet-Cookie: x.tar.gz',
      ' x.tar.gz',
      '-x.tar.gz',
      '.hidden.tar.gz',
    ]) {
      expect(isSafeBackupName(bad), bad).toBe(false);
    }
  });

  it('resolves a current row into BACKUP_DIR and a legacy row into <UPLOAD_DIR>/backups', () => {
    expect(locateBackupFiles({ fileName: 'a.tar.gz' })).toEqual({
      fileName: 'a.tar.gz',
      tarball: path.join(backupRoot(), 'a.tar.gz'),
      counts: path.join(backupRoot(), 'a.counts.json'),
      legacy: false,
    });
    expect(locateBackupFiles({ fileUrl: '/uploads/backups/b.tar.gz' })).toEqual({
      fileName: 'b.tar.gz',
      tarball: path.join(legacyBackupRoot(), 'b.tar.gz'),
      counts: path.join(legacyBackupRoot(), 'b.counts.json'),
      legacy: true,
    });
    // fileName wins once a row has been relocated
    expect(locateBackupFiles({ fileName: 'c.tar.gz', fileUrl: '/uploads/backups/b.tar.gz' })?.legacy).toBe(false);
  });

  it('returns null for rows without a usable reference', () => {
    for (const row of [
      {},
      { fileName: '../x.tar.gz' },
      { fileName: 'x/y.tar.gz' },
      { fileUrl: '/uploads/backups/../x.tar.gz' },
      { fileUrl: '/uploads/backups/sub/x.tar.gz' },
      { fileUrl: '/uploads/documents/x.tar.gz' },
      { fileUrl: 'https://s3.example/backups/x.tar.gz' },
    ]) {
      expect(locateBackupFiles(row), JSON.stringify(row)).toBeNull();
    }
  });
});

describe('restoreTargetProblem', () => {
  const live = 'mongodb://app:pw@db.internal:27017/hrms?authSource=admin';

  it('accepts a URI that names a different database', () => {
    expect(restoreTargetProblem('mongodb://db.internal:27017/hrms_restore', live)).toBeNull();
    expect(restoreTargetProblem('mongodb://scratch.internal/hrms_scratch', live)).toBeNull();
  });

  it('refuses the live URI, the live database name anywhere, a missing name and system databases', () => {
    for (const target of [
      live,
      'mongodb://other-host:27017/hrms', // same database name: one typo away from prod
      'mongodb://db.internal:27017', // no database: mongorestore would use the dump's own name
      'mongodb://db.internal:27017/',
      'mongodb://db.internal:27017/admin',
      'mongodb://db.internal:27017/local',
      'mongodb://db.internal:27017/config',
      'not a uri',
    ]) {
      expect(restoreTargetProblem(target, live), target).toEqual(expect.any(String));
    }
  });
});
