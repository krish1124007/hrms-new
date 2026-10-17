import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createBackupSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["database", "files", "full"]>>;
}, "strip", z.ZodTypeAny, {
    type: "full" | "database" | "files";
}, {
    type?: "full" | "database" | "files" | undefined;
}>;
/**
 * No body: the restore target is server configuration
 * (BACKUP_SCRATCH_MONGO_URI), never something a client chooses.
 */
export declare const restoreBackupSchema: z.ZodObject<{}, "strip", z.ZodTypeAny, {}, {}>;
export declare function listBackups(req: Request, res: Response): Promise<void>;
/**
 * POST /api/v1/backups
 *
 * Creates the row, enqueues a BullMQ job. The worker picks it up,
 * runs mongodump → tar+gzip → BACKUP_DIR → writes `fileName` + `size` back.
 */
export declare function createBackup(req: Request, res: Response): Promise<void>;
/**
 * POST /api/v1/backups/:id/restore
 *
 * **Does NOT overwrite the live database.** The restore lands in the scratch
 * database configured server-side as BACKUP_SCRATCH_MONGO_URI; the operator
 * verifies contents there before any destructive swap. A destructive restore
 * over prod should be an out-of-band console run with a loud warning — not a
 * UI button.
 */
export declare function restoreBackup(req: Request, res: Response): Promise<void>;
/**
 * GET /api/v1/backups/:id/download — streams the tarball. Backups are never
 * exposed as signed file links; this route (backups.manage) is the only way out.
 */
export declare function downloadBackup(req: Request, res: Response): Promise<void>;
/** Removes the row's tarball and sidecar (new or legacy location), then soft-deletes the row. */
export declare function deleteBackup(req: Request, res: Response): Promise<void>;
export declare const updateScheduleSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    enabled: boolean;
}, {
    enabled: boolean;
}>;
export declare function getSchedule(_req: Request, res: Response): Promise<void>;
export declare function updateSchedule(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=backup.controller.d.ts.map