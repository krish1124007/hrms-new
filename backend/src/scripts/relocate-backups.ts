/**
 * Move database backups out of the upload root.
 *
 *   npm run backups:relocate          (from the backend/ directory)
 *   node dist/scripts/relocate-backups.js   (from a built deploy)
 *
 * Backups used to be written to `<UPLOAD_DIR>/backups/` and referenced as
 * `fileUrl: /uploads/backups/<name>`. This moves every file in that folder
 * into BACKUP_DIR (default ./backups), points each matching Backup row at it
 * (`fileName` set, `fileUrl` removed) and prints what it did. Run it once
 * after deploying; re-running is harmless (nothing is overwritten).
 */
/* eslint-disable no-console -- CLI script: its result must print regardless of LOG_LEVEL */
import 'dotenv/config';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { backupRoot, legacyBackupRoot } from '../lib/backups.js';
import { relocateLegacyBackups } from '../services/backup-relocation.service.js';

async function main(): Promise<void> {
  await connectDatabase();
  try {
    const summary = await relocateLegacyBackups();
    console.log(`Backups: ${legacyBackupRoot()} → ${backupRoot()}`);
    console.log(`  files moved:   ${summary.moved.length}`);
    for (const name of summary.moved) console.log(`    ${name}`);
    console.log(`  files skipped: ${summary.skipped.length} (already in BACKUP_DIR, or not a regular file — left in place)`);
    for (const name of summary.skipped) console.log(`    ${name}`);
    console.log(`  rows updated:  ${summary.rowsUpdated}`);
    if (summary.rowsMissingFile.length > 0) {
      console.log(
        `  rows whose file is in neither folder (left unchanged): ${summary.rowsMissingFile.join(', ')}`,
      );
    }
  } finally {
    await disconnectDatabase();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('backups:relocate failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
