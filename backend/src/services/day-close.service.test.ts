/**
 * Nightly day-close: auto-absent for working days with no attendance row,
 * leave rows for approved leave, and auto-checkout of forgotten check-outs.
 *
 * Reference week (October 2026, default week-off rule = Sunday + 4th Saturday):
 *   Sat 10 (2nd Sat, working) · Sun 11 · Mon 12 · Tue 13 · Wed 14 · Thu 15
 * Every day here is in the past, so auto-checkout instants are never in the
 * future relative to the real clock.
 */
import request from 'supertest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Types } from 'mongoose';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { closeBusinessDay } from './day-close.service.js';
import { invalidateWeekOffRule } from './week-off.service.js';
import { Attendance } from '../models/attendance.model.js';
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Holiday } from '../models/holiday.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { Shift } from '../models/shift.model.js';

/** The UTC-midnight day label `Attendance.date` uses for an IST calendar day. */
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
/** An instant given as IST wall-clock time on an IST calendar day. */
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

let seq = 0;
async function makeEmployee(fields: Partial<Record<keyof IEmployee, unknown>> = {}): Promise<IEmployee> {
  seq += 1;
  return Employee.create({
    firstName: 'Day',
    lastName: `Close${seq}`,
    email: `day.close.${seq}.${new Types.ObjectId().toHexString()}@test.local`,
    joiningDate: new Date('2024-01-15'),
    ...fields,
  });
}

async function rowsFor(employee: IEmployee) {
  return Attendance.find({ employeeId: employee._id }).lean().exec();
}

beforeEach(() => {
  invalidateWeekOffRule();
});

describe('closeBusinessDay — auto-absent', () => {
  it('creates one absent row with source auto_absent on a working day with no row', async () => {
    const emp = await makeEmployee();

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 1, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 });
    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('absent');
    expect(rows[0]!.source).toBe('auto_absent');
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-12').toISOString());
  });

  it('resolves the instant to its IST calendar day (01:30 IST Tue is Tuesday, not Monday)', async () => {
    const emp = await makeEmployee();

    // 2026-10-12T20:00Z is still Monday in UTC but 01:30 on Tuesday in IST.
    await closeBusinessDay(new Date('2026-10-12T20:00:00.000Z'));

    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-13').toISOString());
  });

  it('writes nothing on a Sunday', async () => {
    const emp = await makeEmployee();

    const counts = await closeBusinessDay(ist('2026-10-11', '23:59'));

    expect(counts.absentCreated).toBe(0);
    expect(counts.skipped).toBe(1);
    expect(await rowsFor(emp)).toHaveLength(0);
  });

  it('writes nothing on a day outside the shift work days', async () => {
    const shift = await Shift.create({ name: 'Mon-Fri', startTime: '09:30', endTime: '18:30', workDays: [1, 2, 3, 4, 5] });
    const emp = await makeEmployee({ shift: shift._id });

    // Sat 10 Oct is the 2nd Saturday: a company working day, but not on this shift.
    const counts = await closeBusinessDay(ist('2026-10-10', '23:59'));

    expect(counts.absentCreated).toBe(0);
    expect(await rowsFor(emp)).toHaveLength(0);
  });

  it('writes nothing on a public holiday', async () => {
    const emp = await makeEmployee();
    await Holiday.create({ name: 'Founders Day', date: new Date('2026-10-14'), type: 'public' });

    const counts = await closeBusinessDay(ist('2026-10-14', '23:59'));

    expect(counts.absentCreated).toBe(0);
    expect(counts.skipped).toBe(1);
    expect(await rowsFor(emp)).toHaveLength(0);
  });

  it('still marks absent on an optional holiday', async () => {
    const emp = await makeEmployee();
    await Holiday.create({ name: 'Optional Day', date: new Date('2026-10-14'), type: 'optional' });

    await closeBusinessDay(ist('2026-10-14', '23:59'));

    expect(await rowsFor(emp)).toHaveLength(1);
  });

  it('writes nothing before joiningDate, and marks the joining day itself', async () => {
    const emp = await makeEmployee({ joiningDate: new Date('2026-10-13') });

    await closeBusinessDay(ist('2026-10-12', '23:59'));
    expect(await rowsFor(emp)).toHaveLength(0);

    await closeBusinessDay(ist('2026-10-13', '23:59'));
    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-13').toISOString());
  });

  it('writes nothing after exitDate, and marks the exit day itself', async () => {
    const emp = await makeEmployee({ exitDate: new Date('2026-10-12') });

    await closeBusinessDay(ist('2026-10-13', '23:59'));
    expect(await rowsFor(emp)).toHaveLength(0);

    await closeBusinessDay(ist('2026-10-12', '23:59'));
    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.date.toISOString()).toBe(label('2026-10-12').toISOString());
  });

  it('ignores employees who are not active', async () => {
    const resigned = await makeEmployee({ status: 'resigned' });
    const inactive = await makeEmployee({ status: 'inactive' });

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 });
    expect(await rowsFor(resigned)).toHaveLength(0);
    expect(await rowsFor(inactive)).toHaveLength(0);
  });

  it('leaves a day that already has a row untouched', async () => {
    const emp = await makeEmployee();
    const existing = await Attendance.create({
      employeeId: emp._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      checkOut: { time: ist('2026-10-12', '18:30'), method: 'manual' },
      totalWorkingHours: 9,
      status: 'present',
    });
    const before = await Attendance.findById(existing._id).lean().exec();

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 });
    const rows = await rowsFor(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(before);
  });

  it('does not collide with a soft-deleted row for the day (counted as skipped)', async () => {
    const emp = await makeEmployee();
    const row = await Attendance.create({ employeeId: emp._id, date: label('2026-10-12'), status: 'present' });
    await row.softDelete();

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 1 });
    expect(await Attendance.countDocuments({ employeeId: emp._id })).toBe(0);
  });
});

describe('closeBusinessDay — approved leave', () => {
  async function leaveFor(
    emp: IEmployee,
    opts: { paid: boolean; status?: 'approved' | 'pending'; isHalfDay?: boolean },
  ) {
    const type = await LeaveType.create({
      name: opts.paid ? 'Casual Leave' : 'Leave Without Pay',
      code: `T${new Types.ObjectId().toHexString().slice(-6)}`,
      daysAllowed: opts.paid ? 12 : 0,
      paidLeave: opts.paid,
    });
    // Mon 12 – Tue 13 Oct; a half day is Monday only.
    return LeaveRequest.create({
      employeeId: emp._id,
      leaveTypeId: type._id,
      startDate: new Date('2026-10-12'),
      endDate: new Date(opts.isHalfDay ? '2026-10-12' : '2026-10-13'),
      days: opts.isHalfDay ? 0.5 : 2,
      isHalfDay: opts.isHalfDay ?? false,
      reason: 'Family function',
      status: opts.status ?? 'approved',
    });
  }

  it('stamps an on_leave row for an approved paid leave day', async () => {
    const emp = await makeEmployee();
    const req = await leaveFor(emp, { paid: true });

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 0, leaveStamped: 1, autoCheckedOut: 0, skipped: 0 });
    const [row] = await rowsFor(emp);
    expect(row!.status).toBe('on_leave');
    expect(row!.isPaidLeave).toBe(true);
    expect(String(row!.leaveRequestId)).toBe(String(req._id));
    expect(row!.source).toBe('leave');
  });

  it('stamps an absent, unpaid row for an approved unpaid leave day', async () => {
    const emp = await makeEmployee();
    const req = await leaveFor(emp, { paid: false });

    await closeBusinessDay(ist('2026-10-13', '23:59'));

    const [row] = await rowsFor(emp);
    expect(row!.status).toBe('absent');
    expect(row!.isPaidLeave).toBe(false);
    expect(String(row!.leaveRequestId)).toBe(String(req._id));
    expect(row!.source).toBe('leave');
  });

  it('stamps a half_day row for an approved half-day leave', async () => {
    const emp = await makeEmployee();
    await leaveFor(emp, { paid: true, isHalfDay: true });

    await closeBusinessDay(ist('2026-10-12', '23:59'));

    const [row] = await rowsFor(emp);
    expect(row!.status).toBe('half_day');
    expect(row!.isPaidLeave).toBe(true);
    expect(row!.source).toBe('leave');
  });

  it('a pending leave does not count: the day is auto-absent', async () => {
    const emp = await makeEmployee();
    await leaveFor(emp, { paid: true, status: 'pending' });

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts.absentCreated).toBe(1);
    expect(counts.leaveStamped).toBe(0);
    const [row] = await rowsFor(emp);
    expect(row!.source).toBe('auto_absent');
  });
});

describe('closeBusinessDay — auto-checkout', () => {
  async function openRow(emp: IEmployee, day: string, inAt: string) {
    return Attendance.create({
      employeeId: emp._id,
      date: label(day),
      checkIn: { time: ist(day, inAt), method: 'manual' },
      status: 'present',
    });
  }

  it('closes an open check-in at autoCheckoutTime (19:00 IST = 13:30Z) and computes hours', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const emp = await makeEmployee();
    const row = await openRow(emp, '2026-10-12', '09:30');

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts).toEqual({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 1, skipped: 0 });
    const after = await Attendance.findById(row._id).lean().exec();
    expect(after!.checkOut!.time!.toISOString()).toBe('2026-10-12T13:30:00.000Z');
    expect(after!.checkOut!.method).toBe('manual');
    expect(after!.checkOut!.metadata).toMatchObject({ autoCheckout: true });
    expect(after!.source).toBe('auto_checkout');
    expect(after!.totalWorkingHours).toBeGreaterThan(0);
    expect(after!.totalWorkingHours).toBe(9.5);
    // 9.5 h against the default 540-minute overtime threshold.
    expect(after!.overtimeHours).toBe(0.5);
    expect(after!.status).toBe('present');
  });

  it('defaults to 23:59 IST when autoCheckoutTime is unset', async () => {
    const emp = await makeEmployee();
    const row = await openRow(emp, '2026-10-12', '09:30');

    await closeBusinessDay(ist('2026-10-12', '23:59'));

    const after = await Attendance.findById(row._id).lean().exec();
    expect(after!.checkOut!.time!.toISOString()).toBe('2026-10-12T18:29:00.000Z');
    expect(after!.source).toBe('auto_checkout');
  });

  it('applies the half-day rule and closes an open break at the auto-checkout time', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const emp = await makeEmployee();
    const row = await openRow(emp, '2026-10-12', '15:00');
    row.breaks.push({ startTime: ist('2026-10-12', '18:00'), type: 'tea' } as never);
    await row.save();

    await closeBusinessDay(ist('2026-10-12', '23:59'));

    const after = await Attendance.findById(row._id).lean().exec();
    // 15:00 → 19:00 minus the 18:00 → 19:00 break = 3 h < 4 h half-day threshold.
    expect(after!.totalWorkingHours).toBe(3);
    expect(after!.status).toBe('half_day');
    expect(after!.breaks[0]!.endTime!.toISOString()).toBe('2026-10-12T13:30:00.000Z');
    expect(after!.breaks[0]!.duration).toBe(60);
  });

  it('uses the shift half-day hours when the employee has a shift', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const shift = await Shift.create({ name: 'Long', startTime: '09:30', endTime: '18:30', halfDayHours: 6 });
    const emp = await makeEmployee({ shift: shift._id });
    const row = await openRow(emp, '2026-10-12', '14:00');

    await closeBusinessDay(ist('2026-10-12', '23:59'));

    const after = await Attendance.findById(row._id).lean().exec();
    expect(after!.totalWorkingHours).toBe(5);
    expect(after!.status).toBe('half_day');
  });

  it('never sets a check-out before the check-in (late check-in after autoCheckoutTime)', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const emp = await makeEmployee();
    const row = await openRow(emp, '2026-10-12', '20:00');

    await closeBusinessDay(ist('2026-10-12', '23:59'));

    const after = await Attendance.findById(row._id).lean().exec();
    expect(after!.checkOut!.time!.getTime()).toBeGreaterThan(after!.checkIn!.time!.getTime());
    expect(after!.checkOut!.time!.toISOString()).toBe('2026-10-12T18:29:00.000Z');
  });

  it('closes open rows of that day only, including employees no longer active', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const gone = await makeEmployee({ status: 'resigned' });
    const today = await openRow(gone, '2026-10-12', '09:30');
    const other = await openRow(gone, '2026-10-13', '09:30');

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(counts.autoCheckedOut).toBe(1);
    expect((await Attendance.findById(today._id).lean())!.checkOut?.time).toBeTruthy();
    expect((await Attendance.findById(other._id).lean())!.checkOut?.time).toBeFalsy();
  });
});

describe('closeBusinessDay — idempotency and dry run', () => {
  it('a second run on the same day creates nothing and checks out nothing', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    const absentee = await makeEmployee();
    const forgetful = await makeEmployee();
    await Attendance.create({
      employeeId: forgetful._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      status: 'present',
    });

    const first = await closeBusinessDay(ist('2026-10-12', '23:59'));
    expect(first).toEqual({ absentCreated: 1, leaveStamped: 0, autoCheckedOut: 1, skipped: 0 });
    const snapshot = await Attendance.find().sort({ _id: 1 }).lean().exec();

    const second = await closeBusinessDay(ist('2026-10-12', '23:59'));

    expect(second).toEqual({ absentCreated: 0, leaveStamped: 0, autoCheckedOut: 0, skipped: 0 });
    expect(await Attendance.find().sort({ _id: 1 }).lean().exec()).toEqual(snapshot);
    expect(await rowsFor(absentee)).toHaveLength(1);
  });

  it('dryRun returns the counts it would produce and writes nothing', async () => {
    await AttendanceConfig.create({ settings: { autoCheckoutTime: '19:00' } });
    await makeEmployee();
    const forgetful = await makeEmployee();
    const open = await Attendance.create({
      employeeId: forgetful._id,
      date: label('2026-10-12'),
      checkIn: { time: ist('2026-10-12', '09:30'), method: 'manual' },
      status: 'present',
    });
    const before = await Attendance.findById(open._id).lean().exec();

    const counts = await closeBusinessDay(ist('2026-10-12', '23:59'), { dryRun: true });

    expect(counts).toEqual({ absentCreated: 1, leaveStamped: 0, autoCheckedOut: 1, skipped: 0 });
    expect(await Attendance.countDocuments()).toBe(1);
    expect(await Attendance.findById(open._id).lean().exec()).toEqual(before);
  });
});

describe('closeBusinessDay and check-in agree on the day label', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a check-in row and a day-close row for the same IST day share the same date', async () => {
    // 01:30 IST on Tuesday 13 Oct — still Monday 12 Oct in UTC, the window
    // where a server-local (UTC) label and the business label disagree.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-12T20:00:00.000Z'));

    const app = createApp();
    const a = await createUser({ roleSlug: 'employee' });
    const empA = await createEmployeeFor(a.user);
    const b = await createUser({ roleSlug: 'employee' });
    const empB = await createEmployeeFor(b.user);

    const res = await request(app)
      .post('/api/v1/attendance/check-in')
      .set({ Authorization: `Bearer ${a.token}` })
      .send({ method: 'manual' });
    expect(res.status).toBe(201);

    await closeBusinessDay(new Date());

    const rowA = await Attendance.findOne({ employeeId: empA._id }).lean().exec();
    const rowB = await Attendance.findOne({ employeeId: empB._id }).lean().exec();
    expect(rowA!.source).toBe('punch');
    expect(rowB!.source).toBe('auto_absent');
    expect(rowB!.date.getTime()).toBe(rowA!.date.getTime());
    expect(rowA!.date.toISOString()).toBe(label('2026-10-13').toISOString());
    // A's check-out time (23:59 IST) has not happened yet, so A stays open.
    expect(rowA!.checkOut?.time).toBeFalsy();
  });
});
