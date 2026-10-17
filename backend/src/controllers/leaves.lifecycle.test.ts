/**
 * Leave lifecycle end to end: apply → approve/reject → cancel/delete, through
 * the real routes.
 *
 * Approving leave writes the attendance rows payroll reads (paid → on_leave,
 * unpaid → absent, half day → half_day), charges the balance atomically, and
 * cancelling gives both back. Applications are checked against the leave
 * type's rules and against balance already promised to pending requests.
 * The reporting manager hears about applications; the employee hears about
 * decisions (in-app and by e-mail).
 *
 * The clock is pinned to Wed 14 Oct 2026, 12:00 IST. October 2026 under the
 * default week-off rule (Sunday + 4th Saturday):
 *   Mon 12 · Tue 13 · Wed 14 (today) · Thu 15 · Fri 16 · Sat 17 · Sun 18
 *   Mon 19 · Tue 20 · Wed 21 · Thu 22 · Fri 23 · Sat 24 (4th Sat, off) · Sun 25
 *   Mon 26 · Tue 27
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { sendMail } from '../services/email.service.js';
import { invalidateWeekOffRule } from '../services/week-off.service.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import { Notification } from '../models/notification.model.js';
import type { IUser } from '../models/user.model.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const NOW = new Date('2026-10-14T06:30:00.000Z');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const isoDay = (d: Date): string => d.toISOString().slice(0, 10);

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

let app: Express;
let hr: Actor;
let manager: Actor;
let emp: Actor;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  invalidateWeekOffRule();
  app = createApp();
  hr = await actor('hr_manager');
  manager = await actor('manager');
  emp = await actor('employee', {
    reportingManager: manager.employee._id,
    gender: 'male',
    confirmationDate: new Date('2025-01-01'),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

async function leaveType(fields: Partial<Record<keyof ILeaveType, unknown>> = {}): Promise<ILeaveType> {
  return LeaveType.create({ name: 'Casual Leave', code: 'CL', daysAllowed: 12, ...fields });
}

function apply(who: Actor, body: Record<string, unknown>) {
  return request(app)
    .post('/api/v1/leaves/requests')
    .set(auth(who.token))
    .send({ reason: 'Family function', ...body });
}

function approve(id: string, who: Actor = hr) {
  return request(app).patch(`/api/v1/leaves/requests/${id}/approve`).set(auth(who.token));
}

async function appliedAndApproved(type: ILeaveType, startDate: string, endDate: string, extra: Record<string, unknown> = {}) {
  const applied = await apply(emp, { leaveTypeId: String(type._id), startDate, endDate, ...extra });
  expect(applied.status).toBe(201);
  const approved = await approve(applied.body.data._id);
  expect(approved.status).toBe(200);
  return applied.body.data._id as string;
}

async function rowsOf(who: Actor) {
  return Attendance.find({ employeeId: who.employee._id }).sort({ date: 1 }).lean().exec();
}

async function usedOf(type: ILeaveType, year = 2026): Promise<number | undefined> {
  const bal = await LeaveBalance.findOne({ employeeId: emp.employee._id, leaveTypeId: type._id, year }).lean().exec();
  return bal?.used;
}

describe('approval stamps attendance', () => {
  it('approving a 3-working-day paid leave writes 3 on_leave rows and charges 3 days', async () => {
    const type = await leaveType();
    const applied = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-23', endDate: '2026-10-27' });
    expect(applied.status).toBe(201);
    expect(applied.body.data.days).toBe(3);

    const res = await approve(applied.body.data._id);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
    const rows = await rowsOf(emp);
    expect(rows.map((r) => isoDay(r.date))).toEqual(['2026-10-23', '2026-10-26', '2026-10-27']);
    for (const row of rows) {
      expect(row.status).toBe('on_leave');
      expect(row.isPaidLeave).toBe(true);
      expect(row.source).toBe('leave');
      expect(String(row.leaveRequestId)).toBe(applied.body.data._id);
    }
    expect(await usedOf(type)).toBe(3);
  });

  it('an unpaid leave type writes absent rows with isPaidLeave false', async () => {
    const type = await leaveType({ name: 'Leave Without Pay', code: 'LWP', daysAllowed: 0, paidLeave: false });

    await appliedAndApproved(type, '2026-10-23', '2026-10-27');

    const rows = await rowsOf(emp);
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row.status).toBe('absent');
      expect(row.isPaidLeave).toBe(false);
      expect(row.source).toBe('leave');
    }
  });

  it('a half-day leave writes one half_day row', async () => {
    const type = await leaveType();

    await appliedAndApproved(type, '2026-10-19', '2026-10-19', { isHalfDay: true, halfDayType: 'first_half' });

    const rows = await rowsOf(emp);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe('half_day');
    expect(isoDay(rows[0]!.date)).toBe('2026-10-19');
    expect(await usedOf(type)).toBe(0.5);
  });

  it('a day that already has a punch keeps present; an auto-absent day becomes leave', async () => {
    const type = await leaveType();
    await Attendance.create({
      employeeId: emp.employee._id,
      date: label('2026-10-12'),
      checkIn: { time: new Date('2026-10-12T04:00:00.000Z'), method: 'manual' },
      status: 'present',
    });
    await Attendance.create({ employeeId: emp.employee._id, date: label('2026-10-13'), status: 'absent', source: 'auto_absent' });

    const id = await appliedAndApproved(type, '2026-10-12', '2026-10-13');

    const [mon, tue] = await rowsOf(emp);
    expect(mon!.status).toBe('present');
    expect(String(mon!.leaveRequestId)).toBe(id);
    expect(tue!.status).toBe('on_leave');
    expect(tue!.source).toBe('leave');
  });
});

describe('balances', () => {
  it('cancelling an approved leave removes the stamped rows and restores used', async () => {
    const type = await leaveType();
    const id = await appliedAndApproved(type, '2026-10-23', '2026-10-27');
    expect(await rowsOf(emp)).toHaveLength(3);
    expect(await usedOf(type)).toBe(3);

    const res = await request(app).patch(`/api/v1/leaves/requests/${id}/cancel`).set(auth(emp.token));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(await rowsOf(emp)).toHaveLength(0);
    expect(await usedOf(type)).toBe(0);
  });

  it('deleting an approved leave also removes its rows and restores used', async () => {
    const type = await leaveType();
    const id = await appliedAndApproved(type, '2026-10-23', '2026-10-27');
    expect(await rowsOf(emp)).toHaveLength(3);

    const res = await request(app).delete(`/api/v1/leaves/requests/${id}`).set(auth(hr.token));

    expect(res.status).toBe(200);
    expect(await rowsOf(emp)).toHaveLength(0);
    expect(await usedOf(type)).toBe(0);
  });

  it('pending requests count against the balance: the second apply that would overdraw it → 400', async () => {
    const type = await leaveType({ daysAllowed: 4 });
    const first = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-21' });
    expect(first.status).toBe(201);

    const second = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-22', endDate: '2026-10-23' });

    expect(second.status).toBe(400);
    expect(second.body.error.message).toMatch(/available: 1/);
    expect(await LeaveRequest.countDocuments({ employeeId: emp.employee._id })).toBe(1);
  });

  it('approve re-checks the balance atomically: consumed meanwhile → 400 INSUFFICIENT_BALANCE, used unchanged', async () => {
    const type = await leaveType({ daysAllowed: 4 });
    const applied = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-21' });
    expect(applied.status).toBe(201);
    // Meanwhile two days are consumed elsewhere (another approval, an adjustment).
    await LeaveBalance.updateOne({ employeeId: emp.employee._id, leaveTypeId: type._id, year: 2026 }, { $set: { used: 2 } });

    const res = await approve(applied.body.data._id);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INSUFFICIENT_BALANCE');
    expect(await usedOf(type)).toBe(2);
    expect((await LeaveRequest.findById(applied.body.data._id).lean())!.status).toBe('pending');
    expect(await rowsOf(emp)).toHaveLength(0);
  });

  it('approving the same request twice charges it once', async () => {
    const type = await leaveType();
    const id = await appliedAndApproved(type, '2026-10-19', '2026-10-21');

    const again = await approve(id);

    expect(again.status).toBe(400);
    expect(await usedOf(type)).toBe(3);
    expect(await rowsOf(emp)).toHaveLength(3);
  });
});

describe('leave type rules', () => {
  it("a female-only leave type applied by a male employee → 400 (a female employee may)", async () => {
    const type = await leaveType({ name: 'Maternity Leave', code: 'ML', daysAllowed: 180, applicableGender: 'female' });

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });
    expect(res.status).toBe(400);

    await Employee.updateOne({ _id: emp.employee._id }, { $set: { gender: 'female' } });
    const ok = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });
    expect(ok.status).toBe(201);
  });

  it('probationAllowed: false for an employee whose confirmation date is in the future → 400', async () => {
    const type = await leaveType({ probationAllowed: false });
    await Employee.updateOne({ _id: emp.employee._id }, { $set: { confirmationDate: new Date('2026-12-01') } });

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/probation/i);

    const allowed = await leaveType({ code: 'SL', name: 'Sick Leave', probationAllowed: true });
    const ok = await apply(emp, { leaveTypeId: String(allowed._id), startDate: '2026-10-19', endDate: '2026-10-19' });
    expect(ok.status).toBe(201);
  });

  it('attachmentRequired without attachments → 400; with one → 201', async () => {
    const type = await leaveType({ name: 'Sick Leave', code: 'SL', attachmentRequired: true });

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });
    expect(res.status).toBe(400);

    const ok = await apply(emp, {
      leaveTypeId: String(type._id),
      startDate: '2026-10-19',
      endDate: '2026-10-19',
      attachments: [{ name: 'certificate.pdf', fileUrl: 'https://files.test.local/certificate.pdf' }],
    });
    expect(ok.status).toBe(201);
  });

  it('an inactive leave type → 400', async () => {
    const type = await leaveType({ isActive: false });

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });

    expect(res.status).toBe(400);
    expect(await LeaveRequest.countDocuments()).toBe(0);
  });

  it('halfDayAllowed: false with isHalfDay → 400', async () => {
    const type = await leaveType({ halfDayAllowed: false });

    const res = await apply(emp, {
      leaveTypeId: String(type._id),
      startDate: '2026-10-19',
      endDate: '2026-10-19',
      isHalfDay: true,
    });

    expect(res.status).toBe(400);
  });

  it('a request spanning December → January → 400 "apply separately per year"', async () => {
    const type = await leaveType();

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-12-31', endDate: '2027-01-01' });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Leave spanning two years must be applied separately per year');
  });
});

describe('cancel policy', () => {
  it('self-cancel of an approved leave that started yesterday → 403; HR cancel of the same needs a reason → 200', async () => {
    const type = await leaveType();
    const id = await appliedAndApproved(type, '2026-10-13', '2026-10-15');
    expect(await usedOf(type)).toBe(3);

    const self = await request(app).patch(`/api/v1/leaves/requests/${id}/cancel`).set(auth(emp.token));
    expect(self.status).toBe(403);
    expect((await LeaveRequest.findById(id).lean())!.status).toBe('approved');

    const noReason = await request(app).patch(`/api/v1/leaves/requests/${id}/cancel`).set(auth(hr.token));
    expect(noReason.status).toBe(400);

    const res = await request(app)
      .patch(`/api/v1/leaves/requests/${id}/cancel`)
      .set(auth(hr.token))
      .send({ reason: 'Employee was at work' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelReason).toBe('Employee was at work');
    expect(await usedOf(type)).toBe(0);
    expect((await Attendance.countDocuments({ leaveRequestId: id }))).toBe(0);
  });

  it('a pending request can still be withdrawn by its owner after its start date', async () => {
    const type = await leaveType();
    const applied = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-13', endDate: '2026-10-13' });
    expect(applied.status).toBe(201);

    const res = await request(app).patch(`/api/v1/leaves/requests/${applied.body.data._id}/cancel`).set(auth(emp.token));

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
  });
});

describe('notifications', () => {
  it("on apply, the reporting manager's user is notified", async () => {
    const type = await leaveType();

    const res = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });

    expect(res.status).toBe(201);
    const notes = await Notification.find({ userId: manager.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.type).toBe('leave_request');
    expect(notes[0]!.link).toBe('/leaves/requests');
    expect(await Notification.countDocuments({ userId: emp.user._id })).toBe(0);
  });

  it("on approve, the employee's user is notified and e-mailed", async () => {
    const type = await leaveType();

    await appliedAndApproved(type, '2026-10-19', '2026-10-19');

    const notes = await Notification.find({ userId: emp.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.link).toBe('/leaves');
    expect(notes[0]!.message).toMatch(/approved/);
    const mails = vi.mocked(sendMail).mock.calls.map(([m]) => m);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe(emp.user.email);
    expect(mails[0]!.subject).toMatch(/approved/i);
  });

  it("on reject, the employee's user is notified and e-mailed", async () => {
    const type = await leaveType();
    const applied = await apply(emp, { leaveTypeId: String(type._id), startDate: '2026-10-19', endDate: '2026-10-19' });

    const res = await request(app)
      .patch(`/api/v1/leaves/requests/${applied.body.data._id}/reject`)
      .set(auth(hr.token))
      .send({ reason: 'Quarter-end close' });

    expect(res.status).toBe(200);
    const notes = await Notification.find({ userId: emp.user._id }).lean().exec();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toMatch(/rejected/);
    const mails = vi.mocked(sendMail).mock.calls.map(([m]) => m);
    expect(mails).toHaveLength(1);
    expect(mails[0]!.to).toBe(emp.user.email);
    expect(mails[0]!.html).toContain('Quarter-end close');
  });
});
