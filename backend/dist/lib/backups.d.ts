/** SystemSetting key for the monthly auto-backup toggle (applied at boot by index.ts). */
export declare const MONTHLY_BACKUP_SETTING = "backup.monthlyEnabled";
/** Absolute BACKUP_DIR. */
export declare function backupRoot(): string;
/** Where backups were written before they moved out of the upload root. */
export declare function legacyBackupRoot(): string;
/** Create BACKUP_DIR (owner-only) if it does not exist yet. */
export declare function ensureBackupDir(): Promise<string>;
/**
 * A stored backup name is used only when it is a bare basename: no `/`, `\`
 * or `..`, and nothing but `[A-Za-z0-9._-]` (so it is also safe inside a
 * quoted Content-Disposition value and can never be read as a CLI option).
 */
export declare function isSafeBackupName(name: string): boolean;
/** `<date>-<id>.tar.gz` → `<date>-<id>.counts.json`; null for any other name. */
export declare function countsNameFor(fileName: string): string | null;
export interface BackupFiles {
    fileName: string;
    tarball: string;
    counts: string | null;
    /** True for a row not yet moved out of `<UPLOAD_DIR>/backups/`. */
    legacy: boolean;
}
/**
 * The on-disk paths of a row's tarball and sidecar, or null when the row has
 * no usable reference (none yet, or one that is not a bare basename).
 */
export declare function locateBackupFiles(row: {
    fileName?: string | null;
    fileUrl?: string | null;
}): BackupFiles | null;
/**
 * Why `target` must not receive a restore, or null when it is acceptable.
 * It has to name its own database, distinct from the live one: the restore
 * runs `mongorestore --drop` into exactly that database, so the same name on
 * any host — or no name, which would fall back to the dump's own — is refused.
 */
export declare function restoreTargetProblem(target: string, live: string): string | null;
//# sourceMappingURL=backups.d.ts.map