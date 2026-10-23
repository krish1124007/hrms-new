/**
 * Who sees whose data on the attendance, leave and expense views.
 *
 * A manager (`attendance.view` + the plain `*.approve`) sees themselves and
 * their direct reports; HR (`attendance.manage`, `*.approve_all`) sees
 * everybody; an employee is refused the company-wide reports. Also: the
 * self-service geofence list, the notice `acknowledgedByMe` flag, and the
 * `expenses.config` gate on expense categories.
 *
 * Cast: manager M with direct report A; employee B reports to somebody else.
 */
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import type { IEmployee } from '../models/employee.model.js';
import { Employee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { GeofenceZone } from '../models/geofence-zone.model.js';
import { Notice } from '../models/notice.model.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { startOfBusinessDay } from '../lib/business-day.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  userId: Types.ObjectId;
  employee: IEmployee;
}

async function actor(roleSlug: RoleSlug, overrides: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user, overrides);
  return { token, userId: user._id as Types.ObjectId, employee };
}

const DAY = new Date('2026-03-10T00:00:00.000Z');

let app: Express;
let M: Actor;
let A: Actor;
let B: Actor;

beforeEach(async () => {
  app = createApp();
  M = await actor('manager');
  A = await actor('employee', { reportingManager: M.employee._id });
  B = await actor('employee', { reportingManager: new Types.ObjectId() });
});

const presentOn = (who: Actor, date = DAY) =>
  Attendance.create({ employeeId: who.employee._id, date, status: 'present' });

const owners = (rows: Array<{ employeeId: unknown }>): string[] =>
  rows
    .map((row) => {
      const id = row.employeeId as { _id?: string } | string;
      return typeof id === 'object' && id !== null ? String(id._id) : String(id);
    })
    .sort();
const idsOf = (...actors: Actor[]): string[] => actors.map((a) => String(a.employee._id)).sort();

describe('attendance records', () => {
  it('a manager sees only themselves and their direct reports; HR sees everybody', async () => {
    await Promise.all([presentOn(M), presentOn(A), presentOn(B)]);

    const mine = await request(app).get('/api/v1/attendance/records').set(auth(M.token));
    expect(mine.status).toBe(200);
    expect(owners(mine.body.data)).toEqual(idsOf(M, A));
    expect(mine.body.pagination.total).toBe(2);

    const narrowedToStranger = await request(app)
      .get('/api/v1/attendance/records')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(M.token));
    expect(narrowedToStranger.status).toBe(200);
    expect(narrowedToStranger.body.data).toEqual([]);

    const searchStranger = await request(app)
      .get('/api/v1/attendance/records')
      .query({ search: B.employee.lastName })
      .set(auth(M.token));
    expect(owners(searchStranger.body.data)).not.toContain(String(B.employee._id));

    const hr = await actor('hr_executive');
    const all = await request(app).get('/api/v1/attendance/records').set(auth(hr.token));
    expect(owners(all.body.data)).toEqual(idsOf(M, A, B));
  });

  it('search is literal (regex characters are escaped); a malformed employeeId is 400, not 500', async () => {
    await Promise.all([presentOn(M), presentOn(A), presentOn(B)]);
    const hr = await actor('hr_executive');
    for (const search of ['(', '[a-', '.*', '(a+)+$']) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app).get('/api/v1/attendance/records').query({ search }).set(auth(hr.token));
      expect(res.status, search).toBe(200);
      expect(res.body.data, search).toEqual([]);
    }
    const bad = await request(app)
      .get('/api/v1/attendance/records')
      .query({ employeeId: 'not-an-id' })
      .set(auth(hr.token));
    expect(bad.status).toBe(400);
    const badForManager = await request(app)
      .get('/api/v1/attendance/records')
      .query({ employeeId: '123' })
      .set(auth(M.token));
    expect(badForManager.status).toBe(400);
  });

  it('dashboard: a manager’s totals and late comers cover themselves and their reports only; HR sees everybody', async () => {
    const today = startOfBusinessDay(new Date());
    await Attendance.create({ employeeId: M.employee._id, date: today, status: 'present' });
    await Attendance.create({ employeeId: A.employee._id, date: today, status: 'late' });
    await Attendance.create({ employeeId: B.employee._id, date: today, status: 'late' });

    const mine = await request(app).get('/api/v1/attendance/dashboard').set(auth(M.token));
    expect(mine.status).toBe(200);
    expect(mine.body.data.totals).toMatchObject({ totalEmployees: 2, present: 2, late: 1 });
    expect(owners(mine.body.data.lateComers)).toEqual(idsOf(A));

    const hr = await actor('hr_executive');
    const all = await request(app).get('/api/v1/attendance/dashboard').set(auth(hr.token));
    expect(all.body.data.totals).toMatchObject({ totalEmployees: 4, present: 3, late: 2 });
    expect(owners(all.body.data.lateComers)).toEqual(idsOf(A, B));
  });

  it('monthly: a manager may open a report\'s month, not a stranger\'s', async () => {
    await Promise.all([presentOn(A), presentOn(B)]);
    const month = { year: 2026, month: 3 };

    const report = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ ...month, employeeId: String(A.employee._id) })
      .set(auth(M.token));
    expect(report.status).toBe(200);
    const real = (report.body.data as Array<{ employeeId: string; isVirtual?: boolean }>).filter((r) => !r.isVirtual);
    expect(real.map((r) => String(r.employeeId))).toEqual([String(A.employee._id)]);

    const stranger = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ ...month, employeeId: String(B.employee._id) })
      .set(auth(M.token));
    expect(stranger.status).toBe(403);
    expect(JSON.stringify(stranger.body)).not.toContain(String(B.employee._id));

    const hr = await actor('hr_executive');
    const hrView = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ ...month, employeeId: String(B.employee._id) })
      .set(auth(hr.token));
    expect(hrView.status).toBe(200);
    expect(
      (hrView.body.data as Array<{ isVirtual?: boolean }>).filter((r) => !r.isVirtual),
    ).toHaveLength(1);
  });

  it('report rows are M and A only for the manager; everybody for HR', async () => {
    await Promise.all([presentOn(M), presentOn(A), presentOn(B)]);
    const range = { from: '2026-03-01', to: '2026-03-31' };

    const mine = await request(app).get('/api/v1/attendance/report').query(range).set(auth(M.token));
    expect(mine.status).toBe(200);
    expect(owners(mine.body.data)).toEqual(idsOf(M, A));

    const hr = await actor('hr_executive');
    const all = await request(app).get('/api/v1/attendance/report').query(range).set(auth(hr.token));
    expect(owners(all.body.data)).toEqual(idsOf(M, A, B));
  });
});

describe('team overview without an employee profile', () => {
  it('is empty for a manager-role user without a profile, everybody for attendance.manage', async () => {
    const { token: profileless } = await createUser({ roleSlug: 'manager' });
    const none = await request(app).get('/api/v1/team/overview').set(auth(profileless));
    expect(none.status).toBe(200);
    expect(none.body.data.members).toEqual([]);
    expect(none.body.data.total).toBe(0);

    const { token: hr } = await createUser({ roleSlug: 'hr_executive' });
    const all = await request(app).get('/api/v1/team/overview').set(auth(hr));
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBe(await Employee.countDocuments({ status: 'active' }));
  });
});

describe('leave and expense reports', () => {
  it('GET /leaves/reports: 403 for an employee; scoped to M and A for the manager', async () => {
    const type = await LeaveType.create({ name: 'Casual', code: 'CL', daysAllowed: 12 });
    for (const who of [M, A, B]) {
      // eslint-disable-next-line no-await-in-loop
      await LeaveRequest.create({
        employeeId: who.employee._id,
        leaveTypeId: type._id,
        startDate: new Date('2026-03-10'),
        endDate: new Date('2026-03-10'),
        days: 1,
        reason: 'Family function',
        status: 'approved',
      });
    }

    const denied = await request(app).get('/api/v1/leaves/reports').set(auth(A.token));
    expect(denied.status).toBe(403);

    const scoped = await request(app).get('/api/v1/leaves/reports').query({ year: 2026 }).set(auth(M.token));
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.totalApprovedDays).toBe(2);

    const hr = await actor('hr_executive');
    const all = await request(app).get('/api/v1/leaves/reports').query({ year: 2026 }).set(auth(hr.token));
    expect(all.body.data.totalApprovedDays).toBe(3);
  });

  it('GET /expense-claims/reports: 403 for an employee; scoped to M and A for the manager', async () => {
    const category = await ExpenseCategory.create({ name: 'Travel', code: 'TRV' });
    for (const who of [M, A, B]) {
      // eslint-disable-next-line no-await-in-loop
      await ExpenseClaim.create({
        employeeId: who.employee._id,
        category: category._id,
        amount: 100,
        date: new Date('2026-03-10'),
        status: 'approved',
      });
    }

    const denied = await request(app).get('/api/v1/expense-claims/reports').set(auth(A.token));
    expect(denied.status).toBe(403);

    const scoped = await request(app)
      .get('/api/v1/expense-claims/reports')
      .query({ year: 2026 })
      .set(auth(M.token));
    expect(scoped.status).toBe(200);
    expect(scoped.body.data.totalApproved).toBe(200);

    const hr = await actor('hr_executive');
    const all = await request(app)
      .get('/api/v1/expense-claims/reports')
      .query({ year: 2026 })
      .set(auth(hr.token));
    expect(all.body.data.totalApproved).toBe(300);
  });
});

describe('expense categories need expenses.config', () => {
  it('403 for a manager (expenses.approve alone); 201 for hr_executive', async () => {
    const denied = await request(app)
      .post('/api/v1/expense-claims/categories')
      .set(auth(M.token))
      .send({ name: 'Bonus', code: 'BNS', requiresReceipt: false });
    expect(denied.status).toBe(403);
    expect(await ExpenseCategory.countDocuments({ code: 'BNS' })).toBe(0);

    const existing = await ExpenseCategory.create({ name: 'Travel', code: 'TRV' });
    const patch = await request(app)
      .patch(`/api/v1/expense-claims/categories/${existing._id}`)
      .set(auth(M.token))
      .send({ name: 'Trips' });
    expect(patch.status).toBe(403);
    const del = await request(app)
      .delete(`/api/v1/expense-claims/categories/${existing._id}`)
      .set(auth(M.token));
    expect(del.status).toBe(403);

    const hr = await actor('hr_executive');
    const ok = await request(app)
      .post('/api/v1/expense-claims/categories')
      .set(auth(hr.token))
      .send({ name: 'Meals', code: 'MEAL', requiresReceipt: false });
    expect(ok.status).toBe(201);
  });
});

describe('GET /attendance/geofences/mine', () => {
  it('gives an employee the active zones that apply to them', async () => {
    const office = await GeofenceZone.create({
      name: 'Head Office',
      type: 'circle',
      center: { lat: 21.17, lng: 72.83 },
      radius: 150,
    });
    await GeofenceZone.create({
      name: 'Old Warehouse',
      type: 'circle',
      center: { lat: 21.2, lng: 72.9 },
      radius: 100,
      isActive: false,
    });

    const res = await request(app).get('/api/v1/attendance/geofences/mine').set(auth(A.token));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      _id: String(office._id),
      name: 'Head Office',
      type: 'circle',
      center: { lat: 21.17, lng: 72.83 },
      radius: 150,
    });

    // The admin list stays admin-only.
    const admin = await request(app).get('/api/v1/attendance/geofences').set(auth(A.token));
    expect(admin.status).toBe(403);
  });
});

describe('notices carry acknowledgedByMe', () => {
  it('flips to true for the caller after they acknowledge, and only for them', async () => {
    const notice = await Notice.create({ title: 'Office closed', content: 'Friday', postedBy: M.userId });

    const flag = async (who: Actor): Promise<boolean> => {
      const res = await request(app).get('/api/v1/notices').set(auth(who.token));
      expect(res.status).toBe(200);
      return res.body.data.find((n: { _id: string }) => n._id === String(notice._id)).acknowledgedByMe;
    };

    expect(await flag(A)).toBe(false);
    const ack = await request(app).post(`/api/v1/notices/${notice._id}/acknowledge`).set(auth(A.token));
    expect(ack.status).toBe(200);
    expect(await flag(A)).toBe(true);
    expect(await flag(B)).toBe(false);
  });

  it('a notice targeted at departments is shown only to their employees (and notices.manage holders)', async () => {
    const sales = new Types.ObjectId();
    const ops = new Types.ObjectId();
    await Employee.updateOne({ _id: A.employee._id }, { $set: { department: sales } });
    await Employee.updateOne({ _id: B.employee._id }, { $set: { department: ops } });
    const everyone = await Notice.create({ title: 'Holiday', content: 'Diwali', postedBy: M.userId });
    const salesOnly = await Notice.create({ title: 'Sales targets', content: 'Q4', postedBy: M.userId, departments: [sales] });

    const titles = async (who: Actor): Promise<string[]> => {
      const res = await request(app).get('/api/v1/notices').set(auth(who.token));
      expect(res.status).toBe(200);
      return res.body.data.map((n: { title: string }) => n.title).sort();
    };
    expect(await titles(A)).toEqual(['Holiday', 'Sales targets']);
    expect(await titles(B)).toEqual(['Holiday']);

    expect((await request(app).get(`/api/v1/notices/${salesOnly._id}`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).post(`/api/v1/notices/${salesOnly._id}/acknowledge`).set(auth(B.token))).status).toBe(404);
    expect((await request(app).get(`/api/v1/notices/${salesOnly._id}`).set(auth(A.token))).status).toBe(200);
    expect((await request(app).get(`/api/v1/notices/${everyone._id}`).set(auth(B.token))).status).toBe(200);

    const hr = await actor('hr_executive'); // notices.manage
    expect(await titles(hr)).toEqual(['Holiday', 'Sales targets']);
  });
});
