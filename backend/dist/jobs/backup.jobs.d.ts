/**
 * Backup + restore BullMQ workers.
 *
 * Two job types on the `backup` queue:
 *
 *   - `backup-create`  → `mongodump`, tar+gzip, copy the tarball and a
 *                        `counts.json` sidecar (drift detection, see
 *                        scripts/backup-verify.ts) into BACKUP_DIR, write
 *                        `fileName` + `size` back to the Backup row.
 *
 *   - `backup-restore` → extract the tarball into a scratch directory and
 *                        `mongorestore` it into the **scratch database**
 *                        configured as BACKUP_SCRATCH_MONGO_URI (never prod;
 *                        the restore UI is a verification step, not a
 *                        destructive one). Job data carries only the id.
 *
 * Every external program runs through lib/shell.ts#run (execFile, no shell,
 * async), so nothing is interpolated into a command line and the event loop
 * keeps serving requests while a backup runs.
 *
 * Restoring over the live DB in a multi-tenant SaaS is a foot-gun we don't
 * give operators a remote for. If you genuinely need a destructive restore,
 * it should be an out-of-band `mongorestore --drop` run from a console with
 * a loud warning — not a button in the web UI.
 */
import { Queue, Worker } from 'bullmq';
import { Types } from 'mongoose';
export declare const backupQueue: Queue<any, any, string, any, any, string>;
/**
 * Whether the monthly schedule is registered with BullMQ, and — when it is —
 * when it really runs next (`nextRun`, epoch ms: the month-end run, not the
 * queue's next 28th–31st wake-up).
 */
export declare function getMonthlyBackupSchedule(): Promise<{
    enabled: boolean;
    pattern: string;
    timezone: string;
    description: string;
    nextRun?: number;
}>;
/**
 * Toggle the monthly schedule. Idempotent — re-enabling overwrites the
 * existing repeatable job.
 */
export declare function setMonthlyBackupSchedule(enabled: boolean): Promise<void>;
export declare function startBackupWorker(): Worker;
export declare function enqueueBackupCreate(backupId: string): Promise<void>;
/** The target database is read from env by the worker; job data is just the id. */
export declare function enqueueBackupRestore(backupId: string): Promise<void>;
export { Types };
//# sourceMappingURL=backup.jobs.d.ts.map