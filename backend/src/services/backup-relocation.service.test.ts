import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';
import { Backup } from '../models/backup.model.js';
import { backupRoot, legacyBackupRoot } from '../lib/backups.js';
import { relocateLegacyBackups } from './backup-relocation.service.js';

const created: string[] = [];
afterAll(() => {
  for (const abs of created) fs.rmSync(abs, { force: true });
});

function writeFixture(dir: string, name: string, body = 'tarball'): string {
  fs.mkdirSync(dir, { recursive: true });
  const abs = path.join(dir, name);
  fs.writeFileSync(abs, body);
  created.push(abs);
  return abs;
}

describe('relocateLegacyBackups', () => {
  it('moves every legacy file into BACKUP_DIR and repoints the rows', async () => {
    const id = randomUUID();
    const tarName = `2026-01-31-${id}.tar.gz`;
    const deletedName = `2026-02-28-${id}.tar.gz`;
    const orphanName = `orphan-${id}.tar.gz`;
    const legacyTar = writeFixture(legacyBackupRoot(), tarName, 'live row');
    writeFixture(legacyBackupRoot(), tarName.replace('.tar.gz', '.counts.json'), '{}');
    writeFixture(legacyBackupRoot(), deletedName, 'deleted row');
    writeFixture(legacyBackupRoot(), orphanName, 'no row');
    for (const name of [tarName, tarName.replace('.tar.gz', '.counts.json'), deletedName, orphanName]) {
      created.push(path.join(backupRoot(), name));
    }

    const row = await Backup.create({ type: 'database', status: 'completed', fileUrl: `/uploads/backups/${tarName}` });
    const deleted = await Backup.create({
      type: 'database',
      status: 'completed',
      fileUrl: `/uploads/backups/${deletedName}`,
    });
    await (deleted as unknown as { softDelete(): Promise<void> }).softDelete();
    const missing = await Backup.create({
      type: 'database',
      status: 'completed',
      fileUrl: `/uploads/backups/gone-${id}.tar.gz`,
    });

    const summary = await relocateLegacyBackups();

    expect(summary.moved).toEqual(
      expect.arrayContaining([tarName, tarName.replace('.tar.gz', '.counts.json'), deletedName, orphanName]),
    );
    expect(summary.skipped).toEqual([]);
    expect(summary.rowsUpdated).toBe(2);
    expect(summary.rowsMissingFile).toEqual([String(missing._id)]);

    expect(fs.existsSync(legacyTar)).toBe(false);
    expect(fs.readFileSync(path.join(backupRoot(), tarName), 'utf8')).toBe('live row');
    expect(fs.readFileSync(path.join(backupRoot(), orphanName), 'utf8')).toBe('no row');

    const updated = await Backup.findById(row._id).lean();
    expect(updated?.fileName).toBe(tarName);
    expect(updated).not.toHaveProperty('fileUrl');
    const updatedDeleted = await Backup.findById(deleted._id).setOptions({ withDeleted: true }).lean();
    expect(updatedDeleted?.fileName).toBe(deletedName);
    const untouched = await Backup.findById(missing._id).lean();
    expect(untouched?.fileUrl).toBe(`/uploads/backups/gone-${id}.tar.gz`);

    // Idempotent: a second run has nothing left to do.
    const again = await relocateLegacyBackups();
    expect(again.moved).toEqual([]);
    expect(again.rowsUpdated).toBe(0);
  });

  it('never overwrites a file already in BACKUP_DIR', async () => {
    const name = `2026-03-31-${randomUUID()}.tar.gz`;
    const source = writeFixture(legacyBackupRoot(), name, 'legacy copy');
    writeFixture(backupRoot(), name, 'already relocated');

    const summary = await relocateLegacyBackups();
    expect(summary.skipped).toContain(name);
    expect(fs.readFileSync(path.join(backupRoot(), name), 'utf8')).toBe('already relocated');
    expect(fs.existsSync(source)).toBe(true);
  });
});
