import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime, todayIST, toISTDateKey } from './format';
import { addDaysToKey, monthBoundsIST, startOfWeekKey } from './business-day';

afterEach(() => {
  vi.useRealTimers();
});

describe('IST date keys', () => {
  it('toISTDateKey maps an instant to its Asia/Kolkata calendar day', () => {
    // 19:00 UTC is 00:30 IST the next day.
    expect(toISTDateKey(new Date('2026-10-20T19:00:00Z'))).toBe('2026-10-21');
    expect(toISTDateKey(new Date('2026-10-20T18:29:59Z'))).toBe('2026-10-20');
    // Day labels stored as UTC midnight and as IST midnight are the same day.
    expect(toISTDateKey('2026-10-20T00:00:00.000Z')).toBe('2026-10-20');
    expect(toISTDateKey('2026-10-19T18:30:00.000Z')).toBe('2026-10-20');
  });

  it('todayIST is the IST day between 00:00 and 05:30 IST, not the UTC day', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T19:00:00Z'));
    expect(todayIST()).toBe('2026-10-21');
  });

  it('adds days to a key across month and year ends', () => {
    expect(addDaysToKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysToKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('starts the week on Monday', () => {
    // 2026-10-21 is a Wednesday.
    expect(startOfWeekKey('2026-10-21')).toBe('2026-10-19');
    expect(startOfWeekKey('2026-10-19')).toBe('2026-10-19');
    // Sunday belongs to the week that began the Monday before.
    expect(startOfWeekKey('2026-10-25')).toBe('2026-10-19');
  });

  it('bounds a month in IST, including the whole last day', () => {
    const { from, to, firstKey, lastKey } = monthBoundsIST(2026, 10);
    expect(firstKey).toBe('2026-10-01');
    expect(lastKey).toBe('2026-10-31');
    expect(from.toISOString()).toBe('2026-09-30T18:30:00.000Z');
    expect(to.toISOString()).toBe('2026-10-31T18:29:59.999Z');
  });
});

describe('formatDate / formatDateTime', () => {
  it('formats in en-IN on the Asia/Kolkata calendar', () => {
    expect(formatDate('2026-10-20T19:00:00Z')).toBe('21 Oct 2026');
    expect(formatDateTime('2026-10-20T19:00:00Z')).toMatch(/^21 Oct 2026.*12:30\s?am$/i);
  });
});
