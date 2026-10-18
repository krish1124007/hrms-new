/**
 * Attendance BullMQ queue.
 *
 *   - `attendance-day-close` → repeatable, every day at 23:59 business time
 *                              (Asia/Kolkata unless `TIMEZONE` overrides it):
 *                              marks no-shows absent, stamps approved leave
 *                              and closes forgotten check-outs. See
 *                              services/day-close.service.ts.
 *   - `leave-year-open`      → repeatable, 00:30 on 1 January business time:
 *                              creates the new year's leave balances
 *                              (pro-rata for mid-year joiners) and carries
 *                              unused days forward. See
 *                              services/leave-year.service.ts.
 *
 * Both jobs are idempotent, so a retried or duplicated run is harmless.
 * Past days the day-close missed are replayed by POST /attendance/close-days;
 * a year the job missed is opened by POST /leaves/balances/open-year.
 */
import { Queue, Worker } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { BUSINESS_TZ, startOfBusinessDay } from '../lib/business-day.js';
import { closeBusinessDay } from '../services/day-close.service.js';
import { openLeaveYear } from '../services/leave-year.service.js';
const QUEUE_NAME = 'attendance';
export const DAY_CLOSE_JOB = 'attendance-day-close';
export const DAY_CLOSE_PATTERN = '59 23 * * *';
export const LEAVE_YEAR_OPEN_JOB = 'leave-year-open';
export const LEAVE_YEAR_OPEN_PATTERN = '30 0 1 1 *';
export const attendanceQueue = new Queue(QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: { age: 7 * 24 * 3600 },
        removeOnFail: { age: 30 * 24 * 3600 },
    },
});
/**
 * Close the day the run was scheduled for. `prevMillis` is the repeat's own
 * fire time (23:59), so a retry that lands after midnight still closes the
 * day it was meant to — `new Date()` there would close the day just begun
 * and mark everyone absent before they could arrive.
 */
async function runDayClose(job) {
    const due = job.opts?.prevMillis ? new Date(job.opts.prevMillis) : new Date();
    const counts = await closeBusinessDay(due);
    logger.info({ due: due.toISOString(), ...counts }, 'attendance-day-close: complete');
    return counts;
}
/**
 * Open the leave year the run was scheduled for — the year of the repeat's own
 * fire time (00:30 on 1 January), else of now, in the business timezone.
 */
async function runLeaveYearOpen(job) {
    const due = job.opts?.prevMillis ? new Date(job.opts.prevMillis) : new Date();
    const year = startOfBusinessDay(due).getUTCFullYear();
    const counts = await openLeaveYear(year);
    logger.info({ year, ...counts }, 'leave-year-open: complete');
    return counts;
}
export function startAttendanceWorker() {
    const worker = new Worker(QUEUE_NAME, async (job) => {
        if (job.name === DAY_CLOSE_JOB)
            return runDayClose(job);
        if (job.name === LEAVE_YEAR_OPEN_JOB)
            return runLeaveYearOpen(job);
        logger.warn({ name: job.name }, 'attendance: unknown job');
        return undefined;
    }, { connection: redis, concurrency: 1 });
    worker.on('failed', (job, err) => logger.error({ jobName: job?.name, err }, 'attendance worker job failed'));
    return worker;
}
/**
 * Register the repeatable jobs. Idempotent — the fixed `jobId` and repeat
 * options map to the same repeat key, so re-registering on every boot does
 * not add a second schedule.
 */
export async function ensureAttendanceSchedules() {
    await attendanceQueue.add(DAY_CLOSE_JOB, {}, { repeat: { pattern: DAY_CLOSE_PATTERN, tz: BUSINESS_TZ }, jobId: DAY_CLOSE_JOB });
    logger.info({ pattern: DAY_CLOSE_PATTERN, tz: BUSINESS_TZ }, 'attendance day-close schedule registered');
    await attendanceQueue.add(LEAVE_YEAR_OPEN_JOB, {}, { repeat: { pattern: LEAVE_YEAR_OPEN_PATTERN, tz: BUSINESS_TZ }, jobId: LEAVE_YEAR_OPEN_JOB });
    logger.info({ pattern: LEAVE_YEAR_OPEN_PATTERN, tz: BUSINESS_TZ }, 'leave-year-open schedule registered');
}
//# sourceMappingURL=attendance.jobs.js.map