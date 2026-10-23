/**
 * Field Visits BullMQ queue.
 *
 *   - `field-nightly` → repeatable, every day at 00:15 business time
 *                       (Asia/Kolkata unless `TIMEZONE` overrides it):
 *                       previous days' open visits auto-closed at the
 *                       `autoCloseTime` setting (flagged `autoClosed`), past
 *                       planned visits marked `missed`, recurring schedules
 *                       planned 7 days ahead. See
 *                       services/field-visits.service.ts `runFieldNightly`.
 *
 * The run is idempotent, so a retried or duplicated run is harmless.
 */
import { Queue, Worker, type Job } from 'bullmq';
import { redis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { BUSINESS_TZ } from '../lib/business-day.js';
import { runFieldNightly } from '../services/field-visits.service.js';

const QUEUE_NAME = 'field';
export const FIELD_NIGHTLY_JOB = 'field-nightly';
export const FIELD_NIGHTLY_PATTERN = '15 0 * * *';

export const fieldQueue = new Queue(QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 60_000 },
    removeOnComplete: { age: 7 * 24 * 3600 },
    removeOnFail: { age: 30 * 24 * 3600 },
  },
});

/**
 * Run for the repeat's own fire time (00:15), so a retry later in the night
 * still works on the day it was meant for.
 */
async function runNightly(job: Job): Promise<unknown> {
  const due = job.opts?.prevMillis ? new Date(job.opts.prevMillis) : new Date();
  const counts = await runFieldNightly(due);
  logger.info({ due: due.toISOString(), ...counts }, 'field-nightly: complete');
  return counts;
}

export function startFieldWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      if (job.name === FIELD_NIGHTLY_JOB) return runNightly(job);
      logger.warn({ name: job.name }, 'field: unknown job');
      return undefined;
    },
    { connection: redis, concurrency: 1 },
  );
  worker.on('failed', (job, err) => logger.error({ jobName: job?.name, err }, 'field worker job failed'));
  return worker;
}

/**
 * Register the repeatable job. Idempotent — the fixed `jobId` and repeat
 * options map to the same repeat key, so re-registering on every boot does
 * not add a second schedule.
 */
export async function ensureFieldSchedules(): Promise<void> {
  await fieldQueue.add(
    FIELD_NIGHTLY_JOB,
    {},
    { repeat: { pattern: FIELD_NIGHTLY_PATTERN, tz: BUSINESS_TZ }, jobId: FIELD_NIGHTLY_JOB },
  );
  logger.info({ pattern: FIELD_NIGHTLY_PATTERN, tz: BUSINESS_TZ }, 'field-nightly schedule registered');
}
