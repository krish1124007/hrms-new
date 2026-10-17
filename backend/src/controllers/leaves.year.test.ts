/**
 * Leave year lifecycle through the real routes: HR opens a year, new joiners
 * are allocated pro-rata (on creation, on import and on their first
 * application), and a reset keeps what was allocated.
 *
 * The clock is pinned to Thu 1 Oct 2026, 12:00 IST.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { invalidateWeekOffRule } from '../services/week-off.service.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import type { IUser } from '../models/user.model.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const NOW = new Date('2026-10-01T06:30:00.000Z');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(roleSlug: string, fields: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const created = await createEmployeeFor(user);
  const employee = Object.keys(fields).length
    ? (await Employee.findByIdAndUpdate(created._id, { $set: fields }, { new: true }).exec())!
    : created;
  return { user, token, employee };
}

async function leaveType(fields: Partial<Record<keyof ILeaveType, unknown>> = {}): Promise<ILeaveType> {
  return LeaveType.create({ name: 'Casual Leave', code: 'CL', daysAllowed: 12, ...fields });
}

let app: Express;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  invalidateWeekOffRule();
  app = createApp();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('POST /leaves/balances/open-year', () => {
  it('hr_manager opens the year and gets the counts', async () => {
    const hr = await actor('hr_manager');
    const bob = await actor('employee');
    await leaveType();
    const el = await leaveType({ name: 'Earned Leave', code: 'EL', daysAllowed: 15, carryForward: { enabled: true, maxDays: 5 } });
    await leaveType({ name: 'Leave Without Pay', code: 'LWP', daysAllowed: 0, paidLeave: false });
    await LeaveBalance.create({ employeeId: bob.employee._id, leaveTypeId: el._id, year: 2026, allocated: 15, used: 8 });

    const res = await request(app)
      .post('/api/v1/leaves/balances/open-year')
      .set(auth(hr.token))
      .send({ year: 2027 });

    // 2 employees × (CL + EL); 7 days remain on bob's EL, the cap is 5.
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { created: 4, carried: 1, skipped: 0 } });
    const carried = await LeaveBalance.findOne({ employeeId: bob.employee._id, leaveTypeId: el._id, year: 2027 }).lean();
    expect(carried).toMatchObject({ allocated: 15, carried: 5 });
  });

  it('running it again changes nothing', async () => {
    const hr = await actor('hr_manager');
    await leaveType();
    const open = () => request(app).post('/api/v1/leaves/balances/open-year').set(auth(hr.token)).send({ year: 2027 });

    expect((await open()).body.data).toEqual({ created: 1, carried: 0, skipped: 0 });
    expect((await open()).body.data).toEqual({ created: 0, carried: 0, skipped: 1 });
  });

  it('an employee cannot open a year → 403', async () => {
    const emp = await actor('employee');
    await leaveType();

    const res = await request(app)
      .post('/api/v1/leaves/balances/open-year')
      .set(auth(emp.token))
      .send({ year: 2027 });

    expect(res.status).toBe(403);
    expect(await LeaveBalance.countDocuments({})).toBe(0);
  });

  it('rejects a year outside 2000–2100', async () => {
    const hr = await actor('hr_manager');
    for (const year of [1999, 2101, 'next', 2027.5]) {
      const res = await request(app)
        .post('/api/v1/leaves/balances/open-year')
        .set(auth(hr.token))
        .send({ year });
      expect(res.status).toBe(400);
    }
  });

  it('accepts the year as a numeric string', async () => {
    const hr = await actor('hr_manager');
    const res = await request(app)
      .post('/api/v1/leaves/balances/open-year')
      .set(auth(hr.token))
      .send({ year: '2027' });
    expect(res.status).toBe(200);
  });
});

describe('new joiners', () => {
  const employeeBody = (extra: Record<string, unknown> = {}) => ({
    firstName: 'New',
    lastName: 'Joiner',
    email: 'new.joiner@test.local',
    joiningDate: '2026-10-01',
    createUserAccount: false,
    ...extra,
  });

  it('an employee created via POST /employees on 1 Oct 2026 gets a pro-rated 2026 balance', async () => {
    const admin = await actor('admin');
    const cl = await leaveType({ daysAllowed: 12 });
    await leaveType({ name: 'Leave Without Pay', code: 'LWP', daysAllowed: 0, paidLeave: false });

    const res = await request(app).post('/api/v1/employees').set(auth(admin.token)).send(employeeBody());

    expect(res.status).toBe(201);
    const balances = await LeaveBalance.find({ employeeId: res.body.data._id }).lean();
    expect(balances).toHaveLength(1);
    expect(balances[0]).toMatchObject({ year: 2026, allocated: 3 });
    expect(String(balances[0]!.leaveTypeId)).toBe(String(cl._id));
  });

  it('an employee who joined in an earlier year gets the full allowance', async () => {
    const admin = await actor('admin');
    const cl = await leaveType({ daysAllowed: 12 });

    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth(admin.token))
      .send(employeeBody({ joiningDate: '2025-05-01' }));

    expect(res.status).toBe(201);
    const bal = await LeaveBalance.findOne({ employeeId: res.body.data._id, leaveTypeId: cl._id, year: 2026 }).lean();
    expect(bal?.allocated).toBe(12);
  });

  it('creating the employee succeeds even when the leave allocation fails', async () => {
    const admin = await actor('admin');
    await leaveType();
    const spy = vi.spyOn(LeaveType, 'find').mockImplementation((() => {
      throw new Error('leave types unavailable');
    }) as never);

    const res = await request(app).post('/api/v1/employees').set(auth(admin.token)).send(employeeBody());
    spy.mockRestore();

    expect(res.status).toBe(201);
    expect(await Employee.countDocuments({ email: 'new.joiner@test.local' })).toBe(1);
  });

  it('POST /employees/import allocates pro-rata for each imported employee', async () => {
    const admin = await actor('admin');
    const cl = await leaveType({ daysAllowed: 12 });

    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(admin.token))
      .send({
        employees: [
          { firstName: 'Imp', lastName: 'One', email: 'imp.one@test.local', joiningDate: '2026-07-15' },
          { firstName: 'Imp', lastName: 'Two', email: 'imp.two@test.local', joiningDate: '2024-02-01' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    const one = await Employee.findOne({ email: 'imp.one@test.local' });
    const two = await Employee.findOne({ email: 'imp.two@test.local' });
    expect((await LeaveBalance.findOne({ employeeId: one!._id, leaveTypeId: cl._id, year: 2026 }).lean())?.allocated).toBe(6);
    expect((await LeaveBalance.findOne({ employeeId: two!._id, leaveTypeId: cl._id, year: 2026 }).lean())?.allocated).toBe(12);
  });

  it('a mid-year joiner who applies before HR opened the year gets the pro-rated figure', async () => {
    const joiner = await actor('employee', { joiningDate: new Date('2026-07-15') });
    const cl = await leaveType({ daysAllowed: 12, probationAllowed: true });

    const res = await request(app)
      .post('/api/v1/leaves/requests')
      .set(auth(joiner.token))
      .send({ leaveTypeId: String(cl._id), startDate: '2026-10-08', endDate: '2026-10-08', reason: 'Errand' });

    expect(res.status).toBe(201);
    const bal = await LeaveBalance.findOne({ employeeId: joiner.employee._id, leaveTypeId: cl._id, year: 2026 }).lean();
    expect(bal?.allocated).toBe(6);
  });

  it('applying still says "contact HR" when the allocation comes to nothing', async () => {
    const joiner = await actor('employee', { joiningDate: new Date('2026-12-01') });
    const floater = await leaveType({ name: 'Floater', code: 'FL', daysAllowed: 1, probationAllowed: true });
    const manual = await leaveType({ name: 'Manual Leave', code: 'ML', daysAllowed: 0, probationAllowed: true });

    for (const type of [floater, manual]) {
      const res = await request(app)
        .post('/api/v1/leaves/requests')
        .set(auth(joiner.token))
        .send({ leaveTypeId: String(type._id), startDate: '2026-12-08', endDate: '2026-12-08', reason: 'Errand' });

      expect(res.status).toBe(400);
      expect(res.body.message ?? res.body.error?.message).toMatch(/contact HR/);
    }
    expect(await LeaveBalance.countDocuments({ employeeId: joiner.employee._id })).toBe(0);
  });
});

describe('POST /leaves/balances/reset', () => {
  it('clears used and carried but keeps what was allocated and adjusted', async () => {
    const hr = await actor('hr_manager');
    const emp = await actor('employee');
    const cl = await leaveType();
    await LeaveBalance.create({
      employeeId: emp.employee._id,
      leaveTypeId: cl._id,
      year: 2026,
      allocated: 12,
      used: 5,
      carried: 3,
      adjusted: 2,
    });
    await LeaveBalance.create({ employeeId: emp.employee._id, leaveTypeId: cl._id, year: 2025, allocated: 12, used: 9 });

    const res = await request(app)
      .post('/api/v1/leaves/balances/reset')
      .set(auth(hr.token))
      .send({ year: 2026 });

    expect(res.status).toBe(200);
    expect(res.body.data.modifiedCount).toBe(1);
    const reset = await LeaveBalance.findOne({ employeeId: emp.employee._id, year: 2026 }).lean();
    expect(reset).toMatchObject({ allocated: 12, adjusted: 2, used: 0, carried: 0 });
    // Another year is untouched.
    const other = await LeaveBalance.findOne({ employeeId: emp.employee._id, year: 2025 }).lean();
    expect(other).toMatchObject({ allocated: 12, used: 9 });
  });
});
