/**
 * The attendance queue registers the nightly day-close as a repeatable job
 * at 23:59 business time, and its worker runs the day-close for "now".
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

const jobs = await vi.importActual<typeof import('./attendance.jobs.js')>('./attendance.jobs.js');
const { closeBusinessDay } = await import('../services/day-close.service.js');

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
});
