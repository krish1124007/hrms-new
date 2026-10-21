import { describe, expect, it } from 'vitest';
import { nextMonthEndRun } from './backup-schedule';

describe('nextMonthEndRun', () => {
  it('moves a 28th candidate to the last day of the month (server in IST)', () => {
    // 28 Oct 2026 23:50 IST
    const candidate = Date.parse('2026-10-28T23:50:00+05:30');
    expect(nextMonthEndRun(candidate).toISOString()).toBe(new Date('2026-10-31T23:50:00+05:30').toISOString());
  });

  it('handles February and leap years', () => {
    expect(nextMonthEndRun(Date.parse('2027-02-28T23:50:00+05:30')).toISOString()).toBe(
      new Date('2027-02-28T23:50:00+05:30').toISOString(),
    );
    expect(nextMonthEndRun(Date.parse('2028-02-28T23:50:00+05:30')).toISOString()).toBe(
      new Date('2028-02-29T23:50:00+05:30').toISOString(),
    );
  });

  it('works when the server runs in UTC', () => {
    expect(nextMonthEndRun(Date.parse('2026-11-28T23:50:00Z')).toISOString()).toBe('2026-11-30T23:50:00.000Z');
  });

  it('keeps a candidate that already is the last day', () => {
    const candidate = Date.parse('2026-12-31T23:50:00+05:30');
    expect(nextMonthEndRun(candidate).getTime()).toBe(candidate);
  });
});
