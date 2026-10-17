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
import 'dotenv/config';
//# sourceMappingURL=relocate-backups.d.ts.map