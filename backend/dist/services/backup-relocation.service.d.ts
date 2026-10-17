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
export declare function relocateLegacyBackups(): Promise<RelocationSummary>;
//# sourceMappingURL=backup-relocation.service.d.ts.map