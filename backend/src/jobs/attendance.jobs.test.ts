/**
 * The attendance queue registers the nightly day-close as a repeatable job
 * at 23:59 business time, and its worker runs the day-close for "now". It
 * also registers the yearly leave-year opening (00:30 on 1 January) and runs
 * it for the business-timezone year.
 *
 * setup.ts stubs this module for every other test; here the real module is
 * loaded against a fake BullMQ so no Redis is needed.
 */
import { describe, it, expect, vi } from 'vitest';

const bull = vi.hoisted(() => ({
  add: vi.fn(async () => undefined),
  getRepeatableJobs: vi.fn(async () => [] as { name: string; key: string }[]),
  removeRepeatableByKey: vi.fn(async () => true),
  processor: undefined as undefined | ((job: Record<string, unknown>) => Promise<unknown>),
  queueNames: [] as string[],
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => {
    bull.queueNames.push(name);
    return {
      add: bull.add,
      getRepeatableJobs: bull.getRepeatableJobs,
      removeRepeatableByKey: bull.removeRepeatableByKey,
    };
  }),
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: Record<string, unknown>) => Promise<unknown>) => {
    bull.processor = processor;
    return { on: vi.fn() };
  }),
}));

vi.mock('../services/day-close.service.js', () => ({
  closeBusinessDay: vi.fn(async () => ({ absentCreated: 2, leaveStamped: 1, autoCheckedOut: 3, skipped: 0 })),
}));

vi.mock('../services/leave-year.service.js', () => ({
  openLeaveYear: vi.fn(async () => ({ created: 10, carried: 4, skipped: 1 })),
}));

const jobs = await vi.importActual<typeof import('./attendance.jobs.js')>('./attendance.jobs.js');
const { closeBusinessDay } = await import('../services/day-close.service.js');
const { openLeaveYear } = await import('../services/leave-year.service.js');

describe('attendance jobs', () => {
  it('uses the `attendance` queue', () => {
    expect(bull.queueNames).toContain('attendance');
  });

  it('registers attendance-day-close at 23:59 Asia/Kolkata', async () => {
    await jobs.ensureAttendanceSchedules();

    expect(bull.add).toHaveBeenCalledWith(
      'attendance-day-close',
      {},
      expect.objectContaining({
        repeat: { pattern: '59 23 * * *', tz: 'Asia/Kolkata' },
        jobId: 'attendance-day-close',
      }),
    );
  });

  it('the worker runs closeBusinessDay for the current instant', async () => {
    jobs.startAttendanceWorker();
    expect(bull.processor).toBeTypeOf('function');

    const before = Date.now();
    const result = await bull.processor!({ name: 'attendance-day-close', opts: {} });

    expect(closeBusinessDay).toHaveBeenCalledTimes(1);
    const arg = vi.mocked(closeBusinessDay).mock.calls[0]![0] as Date;
    expect(arg.getTime()).toBeGreaterThanOrEqual(before);
    expect(arg.getTime()).toBeLessThanOrEqual(Date.now());
    expect(result).toEqual({ absentCreated: 2, leaveStamped: 1, autoCheckedOut: 3, skipped: 0 });
  });

  it('a retry after midnight still closes the scheduled day (repeat fire time)', async () => {
    jobs.startAttendanceWorker();
    // Scheduled 23:59 IST on 12 Oct; the retry runs whenever it runs.
    const scheduled = Date.parse('2026-10-12T18:29:00.000Z');

    await bull.processor!({ name: 'attendance-day-close', opts: { prevMillis: scheduled }, attemptsMade: 1 });

    const arg = vi.mocked(closeBusinessDay).mock.calls[0]![0] as Date;
    expect(arg.getTime()).toBe(scheduled);
  });

  it('registers leave-year-open at 00:30 on 1 January, Asia/Kolkata', async () => {
    await jobs.ensureAttendanceSchedules();

    expect(bull.add).toHaveBeenCalledWith(
      'leave-year-open',
      {},
      expect.objectContaining({
        repeat: { pattern: '30 0 1 1 *', tz: 'Asia/Kolkata' },
        jobId: 'leave-year-open',
      }),
    );
  });

  it('the worker opens the leave year the run was scheduled for', async () => {
    jobs.startAttendanceWorker();
    // 00:30 IST on 1 Jan 2027 is still 31 Dec 2026 in UTC.
    const scheduled = Date.parse('2026-12-31T19:00:00.000Z');

    const result = await bull.processor!({ name: 'leave-year-open', opts: { prevMillis: scheduled } });

    expect(openLeaveYear).toHaveBeenCalledTimes(1);
    expect(openLeaveYear).toHaveBeenCalledWith(2027);
    expect(result).toEqual({ created: 10, carried: 4, skipped: 1 });
  });

  it('with no fire time the worker opens the current business-timezone year', async () => {
    jobs.startAttendanceWorker();
    vi.useFakeTimers({ toFake: ['Date'] });
    // 01:00 IST on 1 Jan 2028 — 2027 in UTC.
    vi.setSystemTime(new Date('2027-12-31T19:30:00.000Z'));
    try {
      await bull.processor!({ name: 'leave-year-open', opts: {} });
    } finally {
      vi.useRealTimers();
    }

    expect(openLeaveYear).toHaveBeenCalledWith(2028);
  });
});
