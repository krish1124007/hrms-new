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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Types } from 'mongoose';
import mongoose from 'mongoose';
import { redis } from '../config/redis.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { Backup } from '../models/backup.model.js';
import { run } from '../lib/shell.js';
import { countsNameFor, ensureBackupDir, isLastBusinessDayOfMonth, locateBackupFiles, nextMonthlyBackupRun, restoreTargetProblem, } from '../lib/backups.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
const QUEUE_NAME = 'backup';
const SYSTEM_DATABASES = new Set(['admin', 'local', 'config']);
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
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), `fp-backup-${backupId}-`));
    const date = new Date().toISOString().slice(0, 10);
    const tarName = `${date}-${backupId}.tar.gz`;
    const countsName = countsNameFor(tarName);
    const tarPath = path.join(scratch, tarName);
    const countsPath = path.join(scratch, countsName);
    const dumpDir = path.join(scratch, 'dump');
    const written = []; // files placed in BACKUP_DIR, removed again on failure
    try {
        logger.info({ backupId }, 'backup: running mongodump');
        // No --quiet: it also suppresses the "Failed: …" line that row.error needs.
        // run() strips URI credentials from what it reports (mongodump echoes them).
        await run('mongodump', [`--uri=${env.MONGODB_URI}`, `--out=${dumpDir}`]);
        logger.info({ backupId }, 'backup: snapshotting collection counts');
        // Uses the already-connected mongoose connection
        const db = mongoose.connection.db;
        const colls = await db.listCollections().toArray();
        const counts = {};
        for (const c of colls) {
            // eslint-disable-next-line no-await-in-loop
            counts[c.name] = await db.collection(c.name).countDocuments();
        }
        await fs.promises.writeFile(countsPath, JSON.stringify(counts, null, 2));
        logger.info({ backupId }, 'backup: tarballing');
        await run('tar', ['-czf', tarPath, '-C', scratch, 'dump']);
        const stat = await fs.promises.stat(tarPath);
        logger.info({ backupId, bytes: stat.size }, 'backup: copying into BACKUP_DIR');
        const dir = await ensureBackupDir();
        for (const [from, name] of [
            [tarPath, tarName],
            [countsPath, countsName],
        ]) {
            const dest = path.join(dir, name);
            written.push(dest);
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.copyFile(from, dest);
            // eslint-disable-next-line no-await-in-loop
            await fs.promises.chmod(dest, 0o600);
        }
        row.status = 'completed';
        row.size = stat.size;
        row.fileName = tarName;
        row.completedAt = new Date();
        await row.save();
        logger.info({ backupId, size: stat.size, fileName: tarName }, 'backup: complete');
    }
    catch (err) {
        logger.error({ err, backupId }, 'backup: failed');
        await Promise.all(written.map((abs) => fs.promises.rm(abs, { force: true })));
        row.status = 'failed';
        row.error = err.message.slice(0, 1000);
        row.completedAt = new Date();
        await row.save();
        throw err;
    }
    finally {
        await fs.promises.rm(scratch, { recursive: true, force: true });
    }
}
/* ─────────── Restore (scratch DB only) ─────────── */
/**
 * The application database's directory inside a mongodump output. Restoring
 * that directory (rather than the dump root) makes mongorestore write into
 * the database the target URI names, instead of the dump's own database name.
 */
async function dumpedDatabaseDir(dumpDir) {
    const entries = await fs.promises.readdir(dumpDir, { withFileTypes: true });
    const dbs = entries.filter((e) => e.isDirectory() && !SYSTEM_DATABASES.has(e.name));
    if (dbs.length !== 1) {
        throw new Error(`expected exactly one database in the dump, found ${dbs.length}`);
    }
    return path.join(dumpDir, dbs[0].name);
}
async function runRestore(job) {
    const { backupId } = job.data;
    const target = env.BACKUP_SCRATCH_MONGO_URI;
    if (!target)
        throw new Error('BACKUP_SCRATCH_MONGO_URI is not configured — refusing to restore');
    const problem = restoreTargetProblem(target, env.MONGODB_URI);
    if (problem)
        throw new Error(`refusing to restore: ${problem}`);
    const row = await Backup.findById(backupId).exec();
    const files = row ? locateBackupFiles(row) : null;
    if (!files)
        throw new Error(`backup ${backupId} has no stored file`);
    const scratch = await fs.promises.mkdtemp(path.join(os.tmpdir(), `fp-restore-${backupId}-`));
    try {
        logger.info({ backupId, legacy: files.legacy }, 'restore: extracting');
        await run('tar', ['-xzf', files.tarball, '-C', scratch]);
        const source = await dumpedDatabaseDir(path.join(scratch, 'dump'));
        logger.info({ backupId }, 'restore: mongorestore into BACKUP_SCRATCH_MONGO_URI');
        await run('mongorestore', [`--uri=${target}`, '--drop', source]);
        logger.info({ backupId }, 'restore: complete');
    }
    catch (err) {
        logger.error({ err, backupId }, 'restore: failed');
        throw err;
    }
    finally {
        await fs.promises.rm(scratch, { recursive: true, force: true });
    }
}
/* ─────────── Scheduled monthly backup ─────────── */
/**
 * Repeatable job that fires every day from the 28th–31st at 23:50 in the
 * business timezone (IST — never the server's, which runs UTC). The handler
 * then guards: only proceeds on the actual last day of the IST month. Cron
 * `L` (last-day-of-month) isn't supported by cron-parser, hence the
 * candidate-window-plus-guard pattern.
 */
const SCHEDULED_JOB_NAME = 'backup-scheduled-monthly';
const SCHEDULE_PATTERN = '50 23 28-31 * *';
async function runScheduledMonthly() {
    if (!isLastBusinessDayOfMonth()) {
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
/**
 * Whether the monthly schedule is registered with BullMQ, and — when it is —
 * when it really runs next (`nextRun`, epoch ms: the month-end run, not the
 * queue's next 28th–31st wake-up).
 */
export async function getMonthlyBackupSchedule() {
    const repeatable = await backupQueue.getRepeatableJobs();
    const job = repeatable.find((j) => j.name === SCHEDULED_JOB_NAME);
    return {
        enabled: !!job,
        pattern: SCHEDULE_PATTERN,
        timezone: BUSINESS_TZ,
        description: 'Last day of every month at 23:50 IST',
        nextRun: job ? nextMonthlyBackupRun().getTime() : undefined,
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
        await backupQueue.add(SCHEDULED_JOB_NAME, {}, { repeat: { pattern: SCHEDULE_PATTERN, tz: BUSINESS_TZ } });
        logger.info({ pattern: SCHEDULE_PATTERN, tz: BUSINESS_TZ }, 'monthly backup schedule enabled');
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
/** The target database is read from env by the worker; job data is just the id. */
export async function enqueueBackupRestore(backupId) {
    await backupQueue.add('backup-restore', { backupId });
}
// Re-exported for Types import consumers
export { Types };
//# sourceMappingURL=backup.jobs.js.map