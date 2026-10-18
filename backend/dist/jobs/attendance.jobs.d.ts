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
export declare const DAY_CLOSE_JOB = "attendance-day-close";
export declare const DAY_CLOSE_PATTERN = "59 23 * * *";
export declare const LEAVE_YEAR_OPEN_JOB = "leave-year-open";
export declare const LEAVE_YEAR_OPEN_PATTERN = "30 0 1 1 *";
export declare const attendanceQueue: Queue<any, any, string, any, any, string>;
export declare function startAttendanceWorker(): Worker;
/**
 * Register the repeatable jobs. Idempotent — the fixed `jobId` and repeat
 * options map to the same repeat key, so re-registering on every boot does
 * not add a second schedule.
 */
export declare function ensureAttendanceSchedules(): Promise<void>;
//# sourceMappingURL=attendance.jobs.d.ts.map