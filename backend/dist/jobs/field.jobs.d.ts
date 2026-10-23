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
import { Queue, Worker } from 'bullmq';
export declare const FIELD_NIGHTLY_JOB = "field-nightly";
export declare const FIELD_NIGHTLY_PATTERN = "15 0 * * *";
export declare const fieldQueue: Queue<any, any, string, any, any, string>;
export declare function startFieldWorker(): Worker;
/**
 * Register the repeatable job. Idempotent — the fixed `jobId` and repeat
 * options map to the same repeat key, so re-registering on every boot does
 * not add a second schedule.
 */
export declare function ensureFieldSchedules(): Promise<void>;
//# sourceMappingURL=field.jobs.d.ts.map