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
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Backup } from '../models/backup.model.js';
import { saveFile, pathFor } from '../lib/local-storage.js';
const QUEUE_NAME = 'backup';
export const backupQueue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
        attempts: 2,
        backoff: { type: 'exponential', delay: 60_000 },
        // Keep a week so on-call can inspect failures
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
    },
});
/* ─────────── Create ─────────── */
async function runBackup(job) {
    const { backupId } = job.data;
    const row = await Backup.findById(backupId).exec();
    if (!row) {
        logger.warn({ backupId }, 'backup: row gone before worker could pick it up');
        return;
    }
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `fp-backup-${backupId}-`));
    const date = new Date().toISOString().slice(0, 10);
    const tarName = `${date}-${backupId}.tar.gz`;
    const tarPath = path.join(scratch, tarName);
    const countsPath = path.join(scratch, tarName.replace(/\.tar\.gz$/, '.counts.json'));
    const dumpDir = path.join(scratch, 'dump');
    const key = `backups/${tarName}`;
    const countsKey = key.replace(/\.tar\.gz$/, '.counts.json');
    try {
        logger.info({ backupId }, 'backup: running mongodump');
        execSync(`mongodump --uri="${env.MONGODB_URI}" --out=${dumpDir} --quiet`, {
            stdio: 'pipe',
        });
        logger.info({ backupId }, 'backup: snapshotting collection counts');
        // Uses the already-connected mongoose connection
        const db = mongoose.connection.db;
        const colls = await db.listCollections().toArray();
        const counts = {};
        for (const c of colls) {
            // eslint-disable-next-line no-await-in-loop
            counts[c.name] = await db.collection(c.name).countDocuments();
        }
        fs.writeFileSync(countsPath, JSON.stringify(counts, null, 2));
        logger.info({ backupId }, 'backup: tarballing');
        execSync(`tar -czf ${tarPath} -C ${scratch} dump`, { stdio: 'pipe' });
        const stat = fs.statSync(tarPath);
        logger.info({ backupId, bytes: stat.size }, 'backup: saving to local storage');
        const fileUrl = await saveFile(key, fs.readFileSync(tarPath), 'application/gzip');
        await saveFile(countsKey, fs.readFileSync(countsPath), 'application/json');
        row.status = 'completed';
        row.size = stat.size;
        row.fileUrl = fileUrl;
        row.completedAt = new Date();
        await row.save();
        logger.info({ backupId, size: stat.size, url: fileUrl }, 'backup: complete');
    }
    catch (err) {
        logger.error({ err, backupId }, 'backup: failed');
        row.status = 'failed';
        row.error = err.message.slice(0, 1000);
        row.completedAt = new Date();
        await row.save();
        throw err;
    }
    finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}
/* ─────────── Restore (scratch DB only) ─────────── */
async function runRestore(job) {
    const { backupId, scratchMongoUri } = job.data;
    const row = await Backup.findById(backupId).exec();
    if (!row?.fileUrl) {
        throw new Error(`backup ${backupId} has no fileUrl`);
    }
    if (scratchMongoUri === env.MONGODB_URI ||
        scratchMongoUri.includes('ddhrms_prod') ||
        scratchMongoUri.includes('prod-')) {
        throw new Error('refusing to restore over the live database — use a scratch URI');
    }
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), `fp-restore-${backupId}-`));
    const tarPath = path.join(scratch, 'dump.tar.gz');
    // fileUrl looks like /uploads/backups/<file>.tar.gz — strip the /uploads/ prefix
    // to get the storage key.
    const key = row.fileUrl.replace(/^\/uploads\//, '');
    try {
        logger.info({ backupId, key }, 'restore: copying tarball from local storage');
        fs.copyFileSync(pathFor(key), tarPath);
        logger.info({ backupId }, 'restore: extracting');
        execSync(`tar -xzf ${tarPath} -C ${scratch}`, { stdio: 'pipe' });
        logger.info({ backupId, scratchMongoUri }, 'restore: mongorestore into scratch');
        execSync(`mongorestore --uri="${scratchMongoUri}" --drop --quiet ${path.join(scratch, 'dump')}`, { stdio: 'pipe' });
        logger.info({ backupId }, 'restore: complete');
    }
    catch (err) {
        logger.error({ err, backupId }, 'restore: failed');
        throw err;
    }
    finally {
        fs.rmSync(scratch, { recursive: true, force: true });
    }
}
/* ─────────── Scheduled monthly backup ─────────── */
/**
 * Repeatable job that fires every day from the 28th–31st at 23:50.
 * The handler then guards: only proceeds on the actual last day of the
 * month. Cron `L` (last-day-of-month) isn't supported by cron-parser,
 * hence the candidate-window-plus-guard pattern.
 */
const SCHEDULED_JOB_NAME = 'backup-scheduled-monthly';
const SCHEDULE_PATTERN = '50 23 28-31 * *';
function isLastDayOfMonth(d = new Date()) {
    const tomorrow = new Date(d);
    tomorrow.setDate(d.getDate() + 1);
    return tomorrow.getMonth() !== d.getMonth();
}
async function runScheduledMonthly() {
    if (!isLastDayOfMonth()) {
        logger.info('backup-scheduled-monthly: not the last day of the month, skipping');
        return;
    }
    const backup = await Backup.create({
        type: 'database',
        status: 'in_progress',
        trigger: 'scheduled',
        startedAt: new Date(),
    });
    logger.info({ backupId: String(backup._id) }, 'backup-scheduled-monthly: row created, running mongodump');
    await runBackup({ data: { backupId: String(backup._id) } });
}
/** Returns whether the monthly schedule is registered with BullMQ. */
export async function getMonthlyBackupSchedule() {
    const repeatable = await backupQueue.getRepeatableJobs();
    const job = repeatable.find((j) => j.name === SCHEDULED_JOB_NAME);
    return {
        enabled: !!job,
        pattern: SCHEDULE_PATTERN,
        description: 'Last day of every month at 23:50',
        nextRun: job?.next,
    };
}
/**
 * Toggle the monthly schedule. Idempotent — re-enabling overwrites the
 * existing repeatable job.
 */
export async function setMonthlyBackupSchedule(enabled) {
    const repeatable = await backupQueue.getRepeatableJobs();
    for (const j of repeatable) {
        if (j.name === SCHEDULED_JOB_NAME) {
            await backupQueue.removeRepeatableByKey(j.key);
        }
    }
    if (enabled) {
        await backupQueue.add(SCHEDULED_JOB_NAME, {}, { repeat: { pattern: SCHEDULE_PATTERN } });
        logger.info({ pattern: SCHEDULE_PATTERN }, 'monthly backup schedule enabled');
    }
    else {
        logger.info('monthly backup schedule disabled');
    }
}
/* ─────────── Worker ─────────── */
export function startBackupWorker() {
    const worker = new Worker(QUEUE_NAME, async (job) => {
        if (job.name === 'backup-create')
            return runBackup(job);
        if (job.name === 'backup-restore')
            return runRestore(job);
        if (job.name === SCHEDULED_JOB_NAME)
            return runScheduledMonthly();
        logger.warn({ name: job.name }, 'backup: unknown job');
    }, { connection: redis, concurrency: 1 });
    worker.on('failed', (job, err) => logger.error({ jobName: job?.name, err }, 'backup worker job failed'));
    return worker;
}
/* ─────────── Enqueue helpers ─────────── */
export async function enqueueBackupCreate(backupId) {
    await backupQueue.add('backup-create', { backupId });
}
export async function enqueueBackupRestore(backupId, scratchMongoUri) {
    await backupQueue.add('backup-restore', { backupId, scratchMongoUri });
}
// Re-exported for Types import consumers
export { Types };
//# sourceMappingURL=backup.jobs.js.map