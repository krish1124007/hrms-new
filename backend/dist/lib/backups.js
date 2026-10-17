/**
 * Where database backups live, and where a restore may write.
 *
 * Tarballs (and their `.counts.json` sidecars) live in BACKUP_DIR, outside
 * the upload root, so neither the signed-URL presigner nor the files route
 * can ever hand one out. A row stores only the tarball's basename
 * (`fileName`). Rows written before that keep a legacy
 * `fileUrl: /uploads/backups/<name>` until `npm run backups:relocate` runs;
 * they still resolve, to `<UPLOAD_DIR>/backups/<name>`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { env } from '../config/env.js';
import { uploadRoot } from './local-storage.js';
/** SystemSetting key for the monthly auto-backup toggle (applied at boot by index.ts). */
export const MONTHLY_BACKUP_SETTING = 'backup.monthlyEnabled';
const BACKUP_DIR = path.resolve(env.BACKUP_DIR);
const LEGACY_PREFIX = '/uploads/backups/';
const TARBALL_SUFFIX = '.tar.gz';
const SYSTEM_DATABASES = new Set(['admin', 'local', 'config']);
if (BACKUP_DIR === uploadRoot() || BACKUP_DIR.startsWith(uploadRoot() + path.sep)) {
    throw new Error(`BACKUP_DIR (${BACKUP_DIR}) must be outside UPLOAD_DIR (${uploadRoot()})`);
}
/** Absolute BACKUP_DIR. */
export function backupRoot() {
    return BACKUP_DIR;
}
/** Where backups were written before they moved out of the upload root. */
export function legacyBackupRoot() {
    return path.join(uploadRoot(), 'backups');
}
/** Create BACKUP_DIR (owner-only) if it does not exist yet. */
export async function ensureBackupDir() {
    await fs.promises.mkdir(BACKUP_DIR, { recursive: true, mode: 0o700 });
    return BACKUP_DIR;
}
/** Generated names look like `2026-10-17-<objectId>.tar.gz`. */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
/**
 * A stored backup name is used only when it is a bare basename: no `/`, `\`
 * or `..`, and nothing but `[A-Za-z0-9._-]` (so it is also safe inside a
 * quoted Content-Disposition value and can never be read as a CLI option).
 */
export function isSafeBackupName(name) {
    return SAFE_NAME.test(name) && !name.includes('..');
}
/** `<date>-<id>.tar.gz` → `<date>-<id>.counts.json`; null for any other name. */
export function countsNameFor(fileName) {
    return fileName.endsWith(TARBALL_SUFFIX)
        ? `${fileName.slice(0, -TARBALL_SUFFIX.length)}.counts.json`
        : null;
}
/**
 * The on-disk paths of a row's tarball and sidecar, or null when the row has
 * no usable reference (none yet, or one that is not a bare basename).
 */
export function locateBackupFiles(row) {
    let fileName;
    let legacy;
    if (row.fileName) {
        fileName = row.fileName;
        legacy = false;
    }
    else if (row.fileUrl?.startsWith(LEGACY_PREFIX)) {
        fileName = row.fileUrl.slice(LEGACY_PREFIX.length);
        legacy = true;
    }
    else {
        return null;
    }
    if (!isSafeBackupName(fileName))
        return null;
    const dir = legacy ? legacyBackupRoot() : BACKUP_DIR;
    const counts = countsNameFor(fileName);
    return {
        fileName,
        tarball: path.join(dir, fileName),
        counts: counts ? path.join(dir, counts) : null,
        legacy,
    };
}
/** The database a MongoDB URI names ('' when it names none); null if unparsable. */
function databaseName(uri) {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'mongodb:' && url.protocol !== 'mongodb+srv:')
            return null;
        return decodeURIComponent(url.pathname.replace(/^\/+/, ''));
    }
    catch {
        return null;
    }
}
/**
 * Why `target` must not receive a restore, or null when it is acceptable.
 * It has to name its own database, distinct from the live one: the restore
 * runs `mongorestore --drop` into exactly that database, so the same name on
 * any host — or no name, which would fall back to the dump's own — is refused.
 */
export function restoreTargetProblem(target, live) {
    if (target === live)
        return 'the restore target is the live database (MONGODB_URI)';
    const db = databaseName(target);
    if (db === null)
        return 'the restore target is not a mongodb:// or mongodb+srv:// URI';
    if (!db)
        return 'the restore target must name a scratch database (mongodb://host/<database>)';
    if (SYSTEM_DATABASES.has(db.toLowerCase()))
        return `the restore target must not be the "${db}" system database`;
    const liveDb = databaseName(live) || 'test'; // the driver's default when the URI names none
    if (db.toLowerCase() === liveDb.toLowerCase()) {
        return `the restore target names the live database "${liveDb}"; use a different name, e.g. "${liveDb}_restore"`;
    }
    return null;
}
//# sourceMappingURL=backups.js.map