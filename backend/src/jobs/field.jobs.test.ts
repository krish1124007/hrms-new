/**
 * The `field` queue registers the nightly field run (`field-nightly`) at
 * 00:15 business time, and its worker runs it for the repeat's own fire time
 * (so a retry later in the night still plans and closes the right days).
 *
 * setup.ts stubs this module for every other test; here the real module is
 * loaded against a fake BullMQ so no Redis is needed.
 */
import { describe, it, expect, vi } from 'vitest';

const bull = vi.hoisted(() => ({
  add: vi.fn(async () => undefined),
  processor: undefined as undefined | ((job: Record<string, unknown>) => Promise<unknown>),
  queueNames: [] as string[],
}));

vi.mock('bullmq', () => ({
  Queue: vi.fn().mockImplementation((name: string) => {
    bull.queueNames.push(name);
    return { add: bull.add };
  }),
  Worker: vi.fn().mockImplementation((_name: string, processor: (job: Record<string, unknown>) => Promise<unknown>) => {
    bull.processor = processor;
    return { on: vi.fn() };
  }),
}));

vi.mock('../services/field-visits.service.js', () => ({
  runFieldNightly: vi.fn(async () => ({ planned: 4, missed: 2, autoClosed: 1 })),
}));

const jobs = await vi.importActual<typeof import('./field.jobs.js')>('./field.jobs.js');
const { runFieldNightly } = await import('../services/field-visits.service.js');

describe('field jobs', () => {
  it('uses the `field` queue', () => {
    expect(bull.queueNames).toContain('field');
  });

  it('registers field-nightly at 00:15 Asia/Kolkata', async () => {
    await jobs.ensureFieldSchedules();
    expect(bull.add).toHaveBeenCalledWith(
      'field-nightly',
      {},
      expect.objectContaining({ repeat: { pattern: '15 0 * * *', tz: 'Asia/Kolkata' }, jobId: 'field-nightly' }),
    );
  });

  it('the worker runs the nightly field run for the repeat fire time (now when absent)', async () => {
    jobs.startFieldWorker();
    expect(bull.processor).toBeTypeOf('function');

    const fired = Date.UTC(2026, 9, 22, 18, 45); // 00:15 IST, 23 Oct
    const result = await bull.processor!({ name: 'field-nightly', opts: { prevMillis: fired } });
    expect(result).toEqual({ planned: 4, missed: 2, autoClosed: 1 });
    expect((vi.mocked(runFieldNightly).mock.calls[0]![0] as Date).getTime()).toBe(fired);

    const before = Date.now();
    await bull.processor!({ name: 'field-nightly', opts: {} });
    expect((vi.mocked(runFieldNightly).mock.calls[1]![0] as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it('ignores unknown job names', async () => {
    jobs.startFieldWorker();
    expect(await bull.processor!({ name: 'something-else', opts: {} })).toBeUndefined();
  });
});
