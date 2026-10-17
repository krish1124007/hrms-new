/**
 * Leave ↔ attendance: the rows an approved leave writes (and takes back), and
 * the balance arithmetic leave applications are checked against.
 *
 * Reference calendar (October 2026, default week-off rule = Sunday + 4th Saturday):
 *   Mon 12 · Tue 13 · … · Fri 16 · Sat 17 (3rd Sat, working) · Sun 18 · Mon 19
 *   Fri 23 · Sat 24 (4th Sat, off) · Sun 25 · Mon 26 · Tue 27
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import {
  availableBalance,
  chargeLeaveBalance,
  ensureLeaveBalance,
  stampLeaveDays,
  unstampLeaveDays,
} from './leave-attendance.service.js';
import { invalidateWeekOffRule } from './week-off.service.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Holiday } from '../models/holiday.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveRequest, type ILeaveRequest } from '../models/leave-request.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import { Shift } from '../models/shift.model.js';

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

let seq = 0;
async function makeEmployee(fields: Partial<Record<keyof IEmployee, unknown>> = {}): Promise<IEmployee> {
  seq += 1;
  return Employee.create({
    firstName: 'Leave',
    lastName: `Stamp${seq}`,
    email: `leave.stamp.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...fields,
  });
}

async function makeType(paid = true): Promise<ILeaveType> {
  return LeaveType.create({
    name: paid ? 'Casual Leave' : 'Leave Without Pay',
    code: `T${new Types.ObjectId().toHexString().slice(-6)}`,
    daysAllowed: paid ? 12 : 0,
    paidLeave: paid,
  });
}

async function approvedLeave(
  emp: IEmployee,
  type: ILeaveType,
  from: string | Date,
  to: string | Date,
  extra: Partial<Record<keyof ILeaveRequest, unknown>> = {},
): Promise<ILeaveRequest> {
  return LeaveRequest.create({
    employeeId: emp._id,
    leaveTypeId: type._id,
    startDate: typeof from === 'string' ? new Date(from) : from,
    endDate: typeof to === 'string' ? new Date(to) : to,
    days: 1,
    reason: 'Family function',
    status: 'approved',
    ...extra,
  });
}

async function rowsFor(emp: IEmployee) {
  return Attendance.find({ employeeId: emp._id }).sort({ date: 1 }).lean().exec();
}

beforeEach(() => {
  invalidateWeekOffRule();
});

describe('stampLeaveDays', () => {
  it('writes one on_leave row per working day of a paid leave, skipping the week-off', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    const leave = await approvedLeave(emp, type, '2026-10-23', '2026-10-27', { days: 3 });

    const touched = await stampLeaveDays(leave, type, emp);

    expect(touched).toBe(3);
    const rows = await rowsFor(emp);
    expect(rows.map((r) => isoDay(r.date))).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']);
    for (const row of rows) {
      expect(row.status).toBe('on_leave');
      expect(row.isPaidLeave).toBe(true);
      expect(row.source).toBe('leave');
      expect(String(row.leaveRequestId)).toBe(String(leave._id));
    }
  });

  it('writes absent rows with isPaidLeave false for an unpaid leave type', async () => {
    const emp = await makeEmployee();
    const type = await makeType(false);
    const leave = await approvedLeave(emp, type, '2026-10-23', '2026-10-27', { days: 3 });

    expect(await stampLeaveDays(leave, type, emp)).toBe(3);

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('absent');
      expect(row.isPaidLeave).toBe(false);
      expect(row.source).toBe('leave');
    }
  });

  it('writes a single half_day row for a half-day leave', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    const leave = await approvedLeave(emp, type, '2026-10-19', '2026-10-19', { days: 0.5, isHalfDay: true });

    expect(await stampLeaveDays(leave, type, emp)).toBe(1);

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('half_day');
    expect(rows[0]!.isPaidLeave).toBe(true);
    expect(isoDay(rows[0]!.date)).toBe('2026-10-19');
  });

  it('a day that already has a punch keeps its status; it is only tagged with the leave', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    await Attendance.create({
      employeeId: emp._id,
      date: label('2026-10-26'),
      checkIn: { time: new Date('2026-10-26T04:00:00.000Z'), method: 'manual' },
      status: 'present',
    });
    const leave = await approvedLeave(emp, type, '2026-10-23', '2026-10-27', { days: 3 });

    expect(await stampLeaveDays(leave, type, emp)).toBe(3);

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(3);
    const punched = rows.find((r) => isoDay(r.date) === '2026-10-26')!;
    expect(punched.status).toBe('present');
    expect(punched.source).toBe('punch');
    expect(String(punched.leaveRequestId)).toBe(String(leave._id));
    expect(punched.isPaidLeave).toBe(true);
    expect(rows.filter((r) => r.status === 'on_leave')).toHaveLength(2);
  });

  it('an auto-absent row (the day was already closed) becomes the leave row', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    await Attendance.create({ employeeId: emp._id, date: label('2026-10-12'), status: 'absent', source: 'auto_absent' });
    const leave = await approvedLeave(emp, type, '2026-10-12', '2026-10-12');

    expect(await stampLeaveDays(leave, type, emp)).toBe(1);

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('on_leave');
    expect(rows[0]!.source).toBe('leave');
    expect(String(rows[0]!.leaveRequestId)).toBe(String(leave._id));
  });

  it("skips public holidays and days outside the employee's shift", async () => {
    const shift = await Shift.create({ name: 'Mon-Fri', startTime: '09:30', endTime: '18:30', workDays: [1, 2, 3, 4, 5] });
    const emp = await makeEmployee({ shift: shift._id });
    const type = await makeType(true);
    await Holiday.create({ name: 'Founders Day', date: new Date('2026-10-19'), type: 'public' });
    // Fri 16 working · Sat 17 not on this shift · Sun 18 week-off · Mon 19 holiday.
    const leave = await approvedLeave(emp, type, '2026-10-16', '2026-10-19');

    expect(await stampLeaveDays(leave, type, emp)).toBe(1);

    const rows = await rowsFor(emp);
    expect(rows.map((r) => isoDay(r.date))).toEqual(['2026-10-16']);
  });

  it('reads dates stored at IST midnight as the day they name', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    // 2026-10-22T18:30Z is 00:00 on Fri 23 Oct in IST.
    const leave = await approvedLeave(
      emp,
      type,
      new Date('2026-10-22T18:30:00.000Z'),
      new Date('2026-10-22T18:30:00.000Z'),
    );

    await stampLeaveDays(leave, type, emp);

    const rows = await rowsFor(emp);
    expect(rows.map((r) => isoDay(r.date))).toEqual(['2026-10-23']);
  });

  it('is idempotent: a second run writes no extra rows', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    const leave = await approvedLeave(emp, type, '2026-10-23', '2026-10-27', { days: 3 });

    await stampLeaveDays(leave, type, emp);
    const first = await rowsFor(emp);
    expect(await stampLeaveDays(leave, type, emp)).toBe(3);

    const second = await rowsFor(emp);
    expect(second).toHaveLength(3);
    expect(second.map((r) => String(r._id))).toEqual(first.map((r) => String(r._id)));
  });
});

describe('unstampLeaveDays', () => {
  it('deletes the rows the leave wrote and untags a punched day, leaving its status', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    await Attendance.create({
      employeeId: emp._id,
      date: label('2026-10-26'),
      checkIn: { time: new Date('2026-10-26T04:00:00.000Z'), method: 'manual' },
      status: 'present',
    });
    const leave = await approvedLeave(emp, type, '2026-10-23', '2026-10-27', { days: 3 });
    await stampLeaveDays(leave, type, emp);

    const touched = await unstampLeaveDays(leave, { now: new Date('2026-10-20T06:30:00.000Z') });

    expect(touched).toBe(3);
    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('present');
    expect(rows[0]!.leaveRequestId).toBeUndefined();
    expect(rows[0]!.isPaidLeave).toBeUndefined();
  });

  it('a past day the leave covered becomes absent again (day-close will not revisit it)', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    const leave = await approvedLeave(emp, type, '2026-10-13', '2026-10-15', { days: 3 });
    await stampLeaveDays(leave, type, emp);

    // Wed 14 Oct, 12:00 IST: Tue 13 is closed; today and tomorrow are not.
    await unstampLeaveDays(leave, { now: new Date('2026-10-14T06:30:00.000Z') });

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(isoDay(rows[0]!.date)).toBe('2026-10-13');
    expect(rows[0]!.status).toBe('absent');
    expect(rows[0]!.source).toBe('auto_absent');
    expect(rows[0]!.leaveRequestId).toBeUndefined();
    expect(rows[0]!.isPaidLeave).toBeUndefined();
  });

  it("never touches another leave's rows", async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    const mine = await approvedLeave(emp, type, '2026-10-23', '2026-10-23');
    const other = await approvedLeave(emp, type, '2026-10-26', '2026-10-26');
    await stampLeaveDays(mine, type, emp);
    await stampLeaveDays(other, type, emp);

    await unstampLeaveDays(mine, { now: new Date('2026-10-20T06:30:00.000Z') });

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(String(rows[0]!.leaveRequestId)).toBe(String(other._id));
  });
});

describe('availableBalance', () => {
  it('remaining = allocated + carried + adjusted − used; pending sums only pending requests of that type and year', async () => {
    const emp = await makeEmployee();
    const otherEmp = await makeEmployee();
    const type = await makeType(true);
    const otherType = await makeType(true);
    await LeaveBalance.create({
      employeeId: emp._id,
      leaveTypeId: type._id,
      year: 2026,
      allocated: 10,
      carried: 2,
      adjusted: -1,
      used: 3,
    });
    const base = { employeeId: emp._id, leaveTypeId: type._id, reason: 'x' };
    await LeaveRequest.create([
      { ...base, startDate: new Date('2026-11-02'), endDate: new Date('2026-11-03'), days: 2, status: 'pending' },
      { ...base, startDate: new Date('2026-11-09'), endDate: new Date('2026-11-10'), days: 1.5, status: 'pending' },
      // Not counted: approved, cancelled, another type, another year, another employee.
      { ...base, startDate: new Date('2026-11-16'), endDate: new Date('2026-11-16'), days: 1, status: 'approved' },
      { ...base, startDate: new Date('2026-11-17'), endDate: new Date('2026-11-17'), days: 1, status: 'cancelled' },
      { ...base, leaveTypeId: otherType._id, startDate: new Date('2026-11-18'), endDate: new Date('2026-11-18'), days: 1, status: 'pending' },
      { ...base, startDate: new Date('2027-01-04'), endDate: new Date('2027-01-04'), days: 1, status: 'pending' },
      { ...base, employeeId: otherEmp._id, startDate: new Date('2026-11-19'), endDate: new Date('2026-11-19'), days: 1, status: 'pending' },
    ]);

    expect(await availableBalance(emp._id as Types.ObjectId, type._id as Types.ObjectId, 2026)).toEqual({
      remaining: 8,
      pending: 3.5,
    });
  });

  it('a 1 January leave stored at IST midnight (31 Dec in UTC) belongs to the new year', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    await LeaveRequest.create({
      employeeId: emp._id,
      leaveTypeId: type._id,
      startDate: new Date('2026-12-31T18:30:00.000Z'),
      endDate: new Date('2026-12-31T18:30:00.000Z'),
      days: 1,
      reason: 'New year',
      status: 'pending',
    });

    const id = emp._id as Types.ObjectId;
    const typeId = type._id as Types.ObjectId;
    expect((await availableBalance(id, typeId, 2026)).pending).toBe(0);
    expect((await availableBalance(id, typeId, 2027)).pending).toBe(1);
  });

  it('no balance row → remaining 0', async () => {
    const emp = await makeEmployee();
    const type = await makeType(true);
    expect(await availableBalance(emp._id as Types.ObjectId, type._id as Types.ObjectId, 2026)).toEqual({
      remaining: 0,
      pending: 0,
    });
  });
});

describe('ensureLeaveBalance', () => {
  const keyOf = (emp: IEmployee, type: ILeaveType, year = 2026) => ({
    employeeId: emp._id as Types.ObjectId,
    leaveTypeId: type._id as Types.ObjectId,
    year,
  });
  const balance = (emp: IEmployee, type: ILeaveType, year = 2026) =>
    LeaveBalance.findOne(keyOf(emp, type, year)).lean().exec();

  it('creates the row with the pro-rated allocation for a mid-year joiner', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-07-15') });
    const type = await makeType(true);

    await ensureLeaveBalance(keyOf(emp, type), type);

    expect((await balance(emp, type))?.allocated).toBe(6);
  });

  it('allocates the full quota to someone who joined before the year', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2025-07-15') });
    const type = await makeType(true);

    await ensureLeaveBalance(keyOf(emp, type), type);

    expect((await balance(emp, type))?.allocated).toBe(12);
  });

  it('leaves an existing row alone', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-07-15') });
    const type = await makeType(true);
    const created = await LeaveBalance.create({ ...keyOf(emp, type), allocated: 20, used: 3 });

    await ensureLeaveBalance(keyOf(emp, type), type);

    const after = await balance(emp, type);
    expect(after).toMatchObject({ allocated: 20, used: 3 });
    expect(after?.updatedAt).toEqual(created.updatedAt);
  });

  it('still creates a (zero-allocation) row for an unpaid type, which only records used', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-07-15') });
    const type = await makeType(false);

    await ensureLeaveBalance(keyOf(emp, type), type);

    expect(await balance(emp, type)).toMatchObject({ allocated: 0, used: 0 });
  });

  it("charging approved leave with no balance row yet uses the pro-rated figure, not the year's quota", async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-07-15') });
    const type = await makeType(true);
    const leave = await approvedLeave(emp, type, '2026-10-12', '2026-10-13', { days: 2 });

    await chargeLeaveBalance(leave, type);

    expect(await balance(emp, type)).toMatchObject({ allocated: 6, used: 2 });
  });
});
