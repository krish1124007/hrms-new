import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { classifyDay, listHolidaysBetween, type HolidayLite } from './day-classifier.js';
import { Holiday } from '../models/holiday.model.js';
import { DEFAULT_WEEK_OFF_RULE, DEFAULT_WORK_DAYS } from './week-off.js';
import { localDateOf } from './business-day.js';

const deptA = new Types.ObjectId();
const deptB = new Types.ObjectId();

function ctx(overrides: Partial<Parameters<typeof classifyDay>[1]> = {}) {
  return {
    workDays: DEFAULT_WORK_DAYS,
    weekOffRule: DEFAULT_WEEK_OFF_RULE,
    holidays: [] as HolidayLite[],
    ...overrides,
  };
}

describe('classifyDay', () => {
  it('Sunday is a weekend', () => {
    // 4 Oct 2026 is a Sunday.
    expect(classifyDay(new Date(2026, 9, 4), ctx())).toBe('weekend');
  });

  it('the 4th Saturday is a weekend under the default rule', () => {
    // 24 Oct 2026 is the 4th Saturday of the month.
    expect(classifyDay(new Date(2026, 9, 24), ctx())).toBe('weekend');
  });

  it('a Saturday that is not the 4th is a working day under the default rule', () => {
    // 10 Oct 2026 is the 2nd Saturday.
    expect(classifyDay(new Date(2026, 9, 10), ctx())).toBe('working');
  });

  it('a public holiday on a Monday is a holiday', () => {
    // 5 Oct 2026 is a Monday.
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'public', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays }))).toBe('holiday');
  });

  it('an optional holiday on a Monday stays a working day', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'optional', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays }))).toBe('working');
  });

  it('a restricted holiday stays a working day', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'restricted', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays }))).toBe('working');
  });

  it('a public holiday restricted to department A applies to A but not B', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'public', departments: [deptA] },
    ];
    const monday = new Date(2026, 9, 5);
    expect(classifyDay(monday, ctx({ holidays, departmentId: deptA }))).toBe('holiday');
    expect(classifyDay(monday, ctx({ holidays, departmentId: deptB }))).toBe('working');
  });

  it('matches department ids across ObjectId and string forms', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'public', departments: [deptA] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays, departmentId: String(deptA) }))).toBe(
      'holiday',
    );
  });

  it('a department-restricted holiday does not apply when the employee has no department', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5), type: 'public', departments: [deptA] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays, departmentId: null }))).toBe(
      'working',
    );
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays }))).toBe('working');
  });

  it('a Monday with no holiday is a working day', () => {
    expect(classifyDay(new Date(2026, 9, 5), ctx())).toBe('working');
  });

  it('a holiday on a different date does not leak onto the day', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 6), type: 'public', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 5), ctx({ holidays }))).toBe('working');
  });

  it('a holiday matches regardless of the time-of-day on either date', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 5, 0, 0, 0), type: 'public', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 5, 18, 45), ctx({ holidays }))).toBe('holiday');
  });

  it('week-off wins over a holiday', () => {
    // A public holiday that lands on a Sunday is still a weekend.
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 4), type: 'public', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 4), ctx({ holidays }))).toBe('weekend');
  });

  it('workDays [1,2,3,4,5] makes Saturday a weekend', () => {
    // 10 Oct 2026 is the 2nd Saturday — working under Mon-Sat, off under Mon-Fri.
    expect(classifyDay(new Date(2026, 9, 10), ctx())).toBe('working');
    expect(classifyDay(new Date(2026, 9, 10), ctx({ workDays: [1, 2, 3, 4, 5] }))).toBe('weekend');
  });

  it('week-off wins over a holiday even when workDays excludes the day', () => {
    const holidays: HolidayLite[] = [
      { date: new Date(2026, 9, 10), type: 'public', departments: [] },
    ];
    expect(classifyDay(new Date(2026, 9, 10), ctx({ holidays, workDays: [1, 2, 3, 4, 5] }))).toBe(
      'weekend',
    );
  });
});

describe('listHolidaysBetween', () => {
  it('returns lean holidays inside the inclusive range, including the end day at any time', async () => {
    await Holiday.create([
      { name: 'Before', date: new Date(2026, 9, 4), type: 'public' },
      { name: 'First day', date: new Date(2026, 9, 5), type: 'public' },
      { name: 'Optional', date: new Date(2026, 9, 8), type: 'optional' },
      { name: 'Dept only', date: new Date(2026, 9, 9), type: 'public', departments: [deptA] },
      // 18:30 business time (IST) on the last day — holidays are matched by business day.
      { name: 'Last day evening', date: new Date('2026-10-12T18:30:00.000+05:30'), type: 'public' },
      { name: 'After', date: new Date(2026, 9, 13), type: 'public' },
    ]);

    const rows = await listHolidaysBetween(new Date(2026, 9, 5, 10), new Date(2026, 9, 12, 9));

    expect(rows).toHaveLength(4);
    const byType = rows.map((r) => r.type).sort();
    expect(byType).toEqual(['optional', 'public', 'public', 'public']);
    const deptRow = rows.find((r) => r.departments.length === 1);
    expect(String(deptRow?.departments[0])).toBe(String(deptA));
    // Only the lite fields come back.
    expect(Object.keys(rows[0]).sort()).toEqual(['date', 'departments', 'type']);
  });

  it('matches a date-only holiday (stored at UTC midnight) to the business day it names, whatever the server TZ', async () => {
    await Holiday.create({ name: 'Founders Day', date: new Date('2026-10-14'), type: 'public' });
    const day = localDateOf(new Date('2026-10-14T00:00:00.000Z'));
    const holidays = await listHolidaysBetween(day, day);
    expect(holidays).toHaveLength(1);
    expect(classifyDay(day, ctx({ holidays }))).toBe('holiday');
    expect(classifyDay(localDateOf(new Date('2026-10-13T00:00:00.000Z')), ctx({ holidays }))).toBe('working');
  });

  it('feeds classifyDay end to end', async () => {
    await Holiday.create({ name: 'Festival', date: new Date(2026, 9, 6), type: 'public' });
    const holidays = await listHolidaysBetween(new Date(2026, 9, 1), new Date(2026, 9, 31));
    expect(classifyDay(new Date(2026, 9, 6), ctx({ holidays }))).toBe('holiday');
    expect(classifyDay(new Date(2026, 9, 7), ctx({ holidays }))).toBe('working');
  });
});
