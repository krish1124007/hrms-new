/**
 * One-off move of backups written under `<UPLOAD_DIR>/backups/` (when they
 * were publicly served) into BACKUP_DIR. Run via `npm run backups:relocate`.
 * Safe to re-run: files already in BACKUP_DIR are never overwritten and rows
 * already pointing at BACKUP_DIR are left alone.
 */
import fs from 'node:fs';
import path from 'node:path';
import { Backup } from '../models/backup.model.js';
import { backupRoot, ensureBackupDir, legacyBackupRoot, locateBackupFiles } from '../lib/backups.js';

export interface RelocationSummary {
  /** Files moved from `<UPLOAD_DIR>/backups/` into BACKUP_DIR. */
  moved: string[];
  /** Entries left in place: a same-named file already exists in BACKUP_DIR, or not a regular file. */
  skipped: string[];
  /** Rows switched from the legacy `fileUrl` to `fileName`. */
  rowsUpdated: number;
  /** Ids of legacy rows whose tarball is in neither location (left untouched). */
  rowsMissingFile: string[];
}

async function exists(abs: string): Promise<boolean> {
  return fs.promises.stat(abs).then(
    () => true,
    () => false,
  );
}

/** rename(), falling back to copy + unlink across filesystems. */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fs.promises.rename(from, to);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err;
    await fs.promises.copyFile(from, to, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(from);
  }
}

export async function relocateLegacyBackups(): Promise<RelocationSummary> {
  const summary: RelocationSummary = { moved: [], skipped: [], rowsUpdated: 0, rowsMissingFile: [] };
  const target = await ensureBackupDir();
  const source = legacyBackupRoot();

  const entries = await fs.promises.readdir(source, { withFileTypes: true }).catch((err: NodeJS.ErrnoException) => {
    if (err.code === 'ENOENT') return [];
    throw err;
  });
  for (const entry of entries) {
    const dest = path.join(target, entry.name);
    if (!entry.isFile() || (await exists(dest))) {
      summary.skipped.push(entry.name);
      continue;
    }
    await moveFile(path.join(source, entry.name), dest);
    await fs.promises.chmod(dest, 0o600);
    summary.moved.push(entry.name);
  }

  // Soft-deleted rows too: they would otherwise point at a file that moved.
  const rows = await Backup.find({ fileUrl: /^\/uploads\/backups\//, fileName: { $exists: false } })
    .setOptions({ withDeleted: true })
    .exec();
  for (const row of rows) {
    const located = locateBackupFiles({ fileUrl: row.fileUrl });
    if (!located || !(await exists(path.join(backupRoot(), located.fileName)))) {
      summary.rowsMissingFile.push(String(row._id));
      continue;
    }
    await Backup.updateOne(
      { _id: row._id },
      { $set: { fileName: located.fileName }, $unset: { fileUrl: 1 } },
    )
      .setOptions({ withDeleted: true })
      .exec();
    summary.rowsUpdated += 1;
  }
  return summary;
}
