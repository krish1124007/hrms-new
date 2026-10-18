/**
 * Dashboard attendance numbers.
 *
 * The attendance rate is present-ish rows (present, late, half day, paid
 * leave) over active employees × the company's working days so far — not
 * calendar days, which counted every Sunday as a day nobody came in.
 *
 * Reference: October 2026 under the default week-off rule (Sunday + 4th
 * Saturday) — Thu 1 and Fri 2 are working days.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Holiday } from '../models/holiday.model.js';
import { attendanceRateBetween, getDashboardData, monthToDateAttendanceRate } from './dashboard.service.js';
import { invalidateWeekOffRule } from './week-off.service.js';

const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

let seq = 0;
async function employees(n: number, fields: Record<string, unknown> = {}): Promise<IEmployee[]> {
  const out: IEmployee[] = [];
  for (let i = 0; i < n; i += 1) {
    seq += 1;
    // eslint-disable-next-line no-await-in-loop
    out.push(
      await Employee.create({
        firstName: 'Rate',
        lastName: `Emp${seq}`,
        email: `rate.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
        joiningDate: new Date('2024-01-15'),
        ...fields,
      }),
    );
  }
  return out;
}

const row = (e: IEmployee, iso: string, status: string, extra: Record<string, unknown> = {}) =>
  Attendance.create({ employeeId: e._id, date: label(iso), status, ...extra });

beforeEach(() => {
  invalidateWeekOffRule();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('monthToDateAttendanceRate', () => {
  it('10 active employees, 2 working days, 15 present-ish rows → 0.75', async () => {
    const staff = await employees(10);
    const [gone] = await employees(1, { status: 'resigned' });
    // Thu 1 Oct: 5 present, 2 late, 1 half day = 8
    for (const e of staff.slice(0, 5)) await row(e, '2026-10-01', 'present');
    for (const e of staff.slice(5, 7)) await row(e, '2026-10-01', 'late');
    await row(staff[7]!, '2026-10-01', 'half_day');
    // Fri 2 Oct: 5 present, 2 on paid leave = 7
    for (const e of staff.slice(0, 5)) await row(e, '2026-10-02', 'present');
    for (const e of staff.slice(5, 7)) await row(e, '2026-10-02', 'on_leave', { isPaidLeave: true, source: 'leave' });
    // Not counted: an absence, last month, an exited employee, a soft-deleted row.
    await row(staff[8]!, '2026-10-02', 'absent');
    await row(staff[0]!, '2026-09-30', 'present');
    await row(gone!, '2026-10-01', 'present');
    const deleted = await row(staff[9]!, '2026-10-02', 'present');
    await Attendance.updateOne({ _id: deleted._id }, { $set: { isDeleted: true } });

    expect(await monthToDateAttendanceRate(ist('2026-10-02', '18:00'))).toBe(0.75);
  });

  it('a public holiday and a Sunday are not working days', async () => {
    const staff = await employees(2);
    await Holiday.create({ name: 'Gandhi Jayanti', date: label('2026-10-02'), type: 'public' });
    // Thu 1 + Sat 3 (1st Sat, working) = 2 working days; Fri 2 holiday, Sun 4 off.
    for (const e of staff) await row(e, '2026-10-01', 'present');
    await row(staff[0]!, '2026-10-03', 'present');

    expect(await attendanceRateBetween(label('2026-10-01'), label('2026-10-04'))).toBe(0.75);
  });

  it('is 0 with no active employees', async () => {
    expect(await monthToDateAttendanceRate(ist('2026-10-02', '18:00'))).toBe(0);
  });
});

describe('getDashboardData — attendance', () => {
  it('absentToday counts the absent rows of the business day; the rates are numbers', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(ist('2026-10-14', '12:00'));
    const staff = await employees(3);
    await row(staff[0]!, '2026-10-14', 'absent', { source: 'auto_absent' });
    await row(staff[1]!, '2026-10-14', 'absent', { source: 'leave', isPaidLeave: false });
    await row(staff[2]!, '2026-10-14', 'present');
    await row(staff[0]!, '2026-10-13', 'absent');

    const data = await getDashboardData(['attendance']);

    expect(data.attendance).toMatchObject({ presentToday: 1, absentToday: 2 });
    expect(typeof data.attendance?.monthToDateRate).toBe('number');
    expect(typeof data.attendance?.averageThisWeek).toBe('number');
  });
});
