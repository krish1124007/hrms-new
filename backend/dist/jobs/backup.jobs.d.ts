/**
 * Backup + restore BullMQ workers.
 *
 * Two job types on the `backup` queue:
 *
 *   - `backup-create`  → shell out to `mongodump`, tar+gzip, upload to S3,
 *                        emit a `counts.json` sidecar for drift detection
 *                        (see scripts/backup-verify.ts which consumes it),
 *                        write `fileUrl` + `size` back to the Backup row.
 *
 *   - `backup-restore` → download the tarball from S3 into a scratch
 *                        directory, extract, `mongorestore` into the
 *                        **scratch database** (never prod; the restore UI
 *                        is a verification step, not a destructive one).
 *
 * Restoring over the live DB in a multi-tenant SaaS is a foot-gun we don't
 * give operators a remote for. If you genuinely need a destructive restore,
 * it should be an out-of-band `mongorestore --drop` run from a console with
 * a loud warning — not a button in the web UI.
 */
import { Queue, Worker } from 'bullmq';
import { Types } from 'mongoose';
export declare const backupQueue: Queue<any, any, string, any, any, string>;
/** Returns whether the monthly schedule is registered with BullMQ. */
export declare function getMonthlyBackupSchedule(): Promise<{
    enabled: boolean;
    pattern: string;
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
export declare function enqueueBackupRestore(backupId: string, scratchMongoUri: string): Promise<void>;
export { Types };
//# sourceMappingURL=backup.jobs.d.ts.map