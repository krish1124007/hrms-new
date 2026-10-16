import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createBackupSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["database", "files", "full"]>>;
}, "strip", z.ZodTypeAny, {
    type: "database" | "files" | "full";
}, {
    type?: "database" | "files" | "full" | undefined;
}>;
export declare const restoreBackupSchema: z.ZodObject<{
    scratchMongoUri: z.ZodString;
}, "strip", z.ZodTypeAny, {
    scratchMongoUri: string;
}, {
    scratchMongoUri: string;
}>;
export declare function listBackups(req: Request, res: Response): Promise<void>;
/**
 * POST /api/v1/backups
 *
 * Creates the row, enqueues a BullMQ job. The worker picks it up,
 * runs mongodump → tar+gzip → S3 → writes `fileUrl` + `size` back.
 */
export declare function createBackup(req: Request, res: Response): Promise<void>;
/**
 * POST /api/v1/backups/:id/restore
 *
 * **Does NOT overwrite the live database.** The caller must supply a
 * `scratchMongoUri` pointing at a throwaway instance; the restore lands
 * there and the operator verifies contents before any destructive swap.
 * A destructive restore over prod should be an out-of-band console run
 * with a loud warning — not a UI button.
 */
export declare function restoreBackup(req: Request, res: Response): Promise<void>;
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