/**
 * The approval chain. A manager (plain `leaves.approve` / `expenses.approve` /
 * `overtime.approve` / `attendance.approve`) sees and decides only the requests
 * of employees who report to them. HR (`*.approve_all`, `attendance.manage`)
 * and admin see and decide everybody's.
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
import type { IUser } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { Attendance } from '../models/attendance.model.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { ensureSystemRoles } from '../lib/seed-roles.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(roleSlug: RoleSlug, overrides: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user, overrides);
  return { user, token, employee };
}

const ids = (res: { body: { data: Array<{ _id: string }> } }): string[] =>
  res.body.data.map((row) => String(row._id)).sort();
const sorted = (...docs: Array<{ _id: unknown }>): string[] => docs.map((d) => String(d._id)).sort();

let app: Express;
/** The manager under test, their direct report, and an employee reporting elsewhere. */
let M: Actor;
let A: Actor;
let B: Actor;

beforeEach(async () => {
  app = createApp();
  M = await actor('manager');
  A = await actor('employee', { reportingManager: M.employee._id });
  // Reports to somebody else: any manager id but M's. (Users are expensive to
  // make — password hashing — so HR callers are created in the tests that need them.)
  B = await actor('employee', { reportingManager: new Types.ObjectId() });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('leaves', () => {
  let type: Awaited<ReturnType<typeof LeaveType.create>>;

  beforeEach(async () => {
    type = await LeaveType.create({ name: 'Casual', code: 'CL', daysAllowed: 12 });
  });

  const leaveFor = (who: Actor, day = '2026-03-10') =>
    LeaveRequest.create({
      employeeId: who.employee._id,
      leaveTypeId: type._id,
      startDate: new Date(day),
      endDate: new Date(day),
      days: 1,
      reason: 'Family function',
      status: 'pending',
    });
  const approve = (who: Actor, id: unknown) =>
    request(app).patch(`/api/v1/leaves/requests/${String(id)}/approve`).set(auth(who.token));
  const reject = (who: Actor, id: unknown) =>
    request(app)
      .patch(`/api/v1/leaves/requests/${String(id)}/reject`)
      .set(auth(who.token))
      .send({ reason: 'Not now' });
  const statusOf = async (id: unknown) => (await LeaveRequest.findById(id))?.status;

  it("a manager approves a direct report's leave", async () => {
    const theirs = await leaveFor(A);

    const res = await approve(M, theirs._id);

    expect(res.status).toBe(200);
    expect(await statusOf(theirs._id)).toBe('approved');
  });

  it("a manager cannot approve a non-report's leave: 403 NOT_YOUR_REPORT, nothing changes", async () => {
    const theirs = await leaveFor(B);

    const res = await approve(M, theirs._id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_YOUR_REPORT');
    expect(await statusOf(theirs._id)).toBe('pending');
  });

  it('rejecting follows the same rule', async () => {
    const reports = await leaveFor(A);
    const stranger = await leaveFor(B, '2026-03-11');

    const denied = await reject(M, stranger._id);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_YOUR_REPORT');
    expect(await statusOf(stranger._id)).toBe('pending');

    expect((await reject(M, reports._id)).status).toBe(200);
    expect(await statusOf(reports._id)).toBe('rejected');
  });

  it('a manager approving their own leave is still SELF_APPROVAL', async () => {
    const own = await leaveFor(M);

    const res = await approve(M, own._id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
  });

  it('hr_executive and hr_manager decide anyone, including non-reports (approve_all)', async () => {
    const HRM = await actor('hr_manager');
    const HRE = await actor('hr_executive');
    const forHre = await leaveFor(B);
    const forHrm = await leaveFor(A, '2026-03-12');

    expect((await approve(HRE, forHre._id)).status).toBe(200);
    expect((await reject(HRM, forHrm._id)).status).toBe(200);
  });

  it('GET /leaves/requests: a manager sees their report and themselves, not other employees', async () => {
    const mine = await leaveFor(M, '2026-03-09');
    const reports = await leaveFor(A, '2026-03-10');
    await leaveFor(B, '2026-03-11');

    const res = await request(app).get('/api/v1/leaves/requests').set(auth(M.token));

    expect(res.status).toBe(200);
    expect(ids(res)).toEqual(sorted(mine, reports));
  });

  it('GET /leaves/requests?employeeId= cannot reach outside the manager’s reports', async () => {
    const reports = await leaveFor(A);
    await leaveFor(B, '2026-03-11');

    const other = await request(app)
      .get('/api/v1/leaves/requests')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(M.token));
    expect(other.status).toBe(200);
    expect(other.body.data).toEqual([]);

    const own = await request(app)
      .get('/api/v1/leaves/requests')
      .query({ employeeId: String(A.employee._id) })
      .set(auth(M.token));
    expect(ids(own)).toEqual(sorted(reports));
  });

  it('GET /leaves/requests: hr_manager sees everyone', async () => {
    const HRM = await actor('hr_manager');
    const all = [await leaveFor(M, '2026-03-09'), await leaveFor(A), await leaveFor(B, '2026-03-11')];

    const res = await request(app).get('/api/v1/leaves/requests').set(auth(HRM.token));

    expect(ids(res)).toEqual(sorted(...all));
  });

  it('GET /leaves/requests/:id: a manager reads a report’s request, not a stranger’s', async () => {
    const HRM = await actor('hr_manager');
    const reports = await leaveFor(A);
    const stranger = await leaveFor(B, '2026-03-11');

    expect(
      (await request(app).get(`/api/v1/leaves/requests/${reports._id}`).set(auth(M.token))).status,
    ).toBe(200);
    expect(
      (await request(app).get(`/api/v1/leaves/requests/${stranger._id}`).set(auth(M.token))).status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/leaves/requests/${stranger._id}`).set(auth(HRM.token))).status,
    ).toBe(200);
  });

  it('GET /leaves/balances: a manager sees their report’s balances and their own only', async () => {
    const HRM = await actor('hr_manager');
    const balance = (who: Actor) =>
      LeaveBalance.create({ employeeId: who.employee._id, leaveTypeId: type._id, year: 2026, allocated: 12 });
    const mine = await balance(M);
    const reports = await balance(A);
    const strangers = await balance(B);

    const res = await request(app).get('/api/v1/leaves/balances').set(auth(M.token));
    expect(ids(res)).toEqual(sorted(mine, reports));

    const probe = await request(app)
      .get('/api/v1/leaves/balances')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(M.token));
    expect(probe.body.data).toEqual([]);

    const hr = await request(app).get('/api/v1/leaves/balances').set(auth(HRM.token));
    expect(ids(hr)).toEqual(sorted(mine, reports, strangers));
  });

  it('GET /leaves/requests/calendar: reasons are visible for reports and HR, not for strangers', async () => {
    const HRM = await actor('hr_manager');
    await leaveFor(A, '2026-03-10');
    await leaveFor(B, '2026-03-10');
    const query = { from: '2026-03-01', to: '2026-03-31' };

    const reasonByEmployee = (res: { body: { data: Array<{ employeeId: { _id: string }; reason?: string }> } }) =>
      Object.fromEntries(res.body.data.map((row) => [String(row.employeeId._id), row.reason]));

    const asManager = reasonByEmployee(
      await request(app).get('/api/v1/leaves/requests/calendar').query(query).set(auth(M.token)),
    );
    expect(asManager).toEqual({
      [String(A.employee._id)]: 'Family function',
      [String(B.employee._id)]: undefined,
    });

    const asHr = reasonByEmployee(
      await request(app).get('/api/v1/leaves/requests/calendar').query(query).set(auth(HRM.token)),
    );
    expect(asHr[String(B.employee._id)]).toBe('Family function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('expense claims', () => {
  let categoryId: unknown;

  beforeEach(async () => {
    const cat = await ExpenseCategory.create({ name: 'Travel', code: 'TRV', requiresReceipt: false });
    categoryId = cat._id;
  });

  const claimFor = (who: Actor, status = 'pending') =>
    ExpenseClaim.create({
      employeeId: who.employee._id,
      category: categoryId,
      amount: 100,
      date: new Date('2026-03-10'),
      status,
    });
  const patch = (who: Actor, id: unknown, action: 'approve' | 'reject' | 'reimburse', body: object = {}) =>
    request(app)
      .patch(`/api/v1/expense-claims/requests/${String(id)}/${action}`)
      .set(auth(who.token))
      .send(action === 'reject' ? { reason: 'No bill', ...body } : body);
  const statusOf = async (id: unknown) => (await ExpenseClaim.findById(id))?.status;

  it("a manager approves a direct report's claim", async () => {
    const theirs = await claimFor(A);

    expect((await patch(M, theirs._id, 'approve')).status).toBe(200);
    expect(await statusOf(theirs._id)).toBe('approved');
  });

  it("a manager cannot approve or reject a non-report's claim: 403 NOT_YOUR_REPORT", async () => {
    const theirs = await claimFor(B);

    for (const action of ['approve', 'reject'] as const) {
      const res = await patch(M, theirs._id, action);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_YOUR_REPORT');
    }
    expect(await statusOf(theirs._id)).toBe('pending');
  });

  it('a manager rejecting a report’s claim works', async () => {
    const theirs = await claimFor(A);

    expect((await patch(M, theirs._id, 'reject')).status).toBe(200);
    expect(await statusOf(theirs._id)).toBe('rejected');
  });

  it('a manager approving their own claim is still SELF_APPROVAL', async () => {
    const own = await claimFor(M);

    const res = await patch(M, own._id, 'approve');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
  });

  it('hr_executive and hr_manager decide anyone’s claim (approve_all)', async () => {
    const HRM = await actor('hr_manager');
    const HRE = await actor('hr_executive');
    const forHre = await claimFor(B);
    const forHrm = await claimFor(A);

    expect((await patch(HRE, forHre._id, 'approve')).status).toBe(200);
    expect((await patch(HRM, forHrm._id, 'reject')).status).toBe(200);
  });

  it('reimbursing is held to the same scope', async () => {
    const HRM = await actor('hr_manager');
    const reports = await claimFor(A, 'approved');
    const stranger = await claimFor(B, 'approved');

    const denied = await patch(M, stranger._id, 'reimburse');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('NOT_YOUR_REPORT');
    expect(await statusOf(stranger._id)).toBe('approved');

    expect((await patch(M, reports._id, 'reimburse')).status).toBe(200);
    expect((await patch(HRM, stranger._id, 'reimburse')).status).toBe(200);
  });

  it('GET /expense-claims/requests: a manager sees their report and themselves; hr_manager sees all', async () => {
    const HRM = await actor('hr_manager');
    const mine = await claimFor(M);
    const reports = await claimFor(A);
    const strangers = await claimFor(B);

    const asManager = await request(app).get('/api/v1/expense-claims/requests').set(auth(M.token));
    expect(ids(asManager)).toEqual(sorted(mine, reports));

    const probe = await request(app)
      .get('/api/v1/expense-claims/requests')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(M.token));
    expect(probe.body.data).toEqual([]);

    const asHr = await request(app).get('/api/v1/expense-claims/requests').set(auth(HRM.token));
    expect(ids(asHr)).toEqual(sorted(mine, reports, strangers));
  });

  it('GET/PATCH/DELETE one claim: a manager reaches a report’s, not a stranger’s', async () => {
    const reports = await claimFor(A);
    const stranger = await claimFor(B);
    const url = (claim: { _id: unknown }) => `/api/v1/expense-claims/requests/${String(claim._id)}`;

    expect((await request(app).get(url(reports)).set(auth(M.token))).status).toBe(200);
    expect((await request(app).get(url(stranger)).set(auth(M.token))).status).toBe(403);
    expect(
      (await request(app).patch(url(stranger)).set(auth(M.token)).send({ description: 'x' })).status,
    ).toBe(403);
    expect((await request(app).delete(url(stranger)).set(auth(M.token))).status).toBe(403);
    expect(await ExpenseClaim.findById(stranger._id)).not.toBeNull();
  });

  it('filing a claim on someone’s behalf needs them to be your report (or approve_all)', async () => {
    const HRM = await actor('hr_manager');
    const file = (who: Actor, onBehalfOf: Actor) =>
      request(app)
        .post('/api/v1/expense-claims/requests')
        .set(auth(who.token))
        .send({
          employeeId: String(onBehalfOf.employee._id),
          category: String(categoryId),
          amount: 50,
          date: '2026-03-10',
          status: 'draft',
        });

    const forReport = await file(M, A);
    expect(forReport.status).toBe(201);
    expect(String(forReport.body.data.employeeId)).toBe(String(A.employee._id));

    const forStranger = await file(M, B);
    expect(forStranger.status).toBe(403);
    expect(forStranger.body.error.code).toBe('NOT_YOUR_REPORT');

    const byHr = await file(HRM, B);
    expect(byHr.status).toBe(201);
    expect(String(byHr.body.data.employeeId)).toBe(String(B.employee._id));
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('overtime', () => {
  const requestFor = (who: Actor, day = '2026-03-10', hours = 2) =>
    OvertimeRequest.create({
      employee: who.employee._id,
      date: new Date(day),
      hours,
      reason: 'Release night',
    });
  const approve = (who: Actor, id: unknown) =>
    request(app).post(`/api/v1/overtime/${String(id)}/approve`).set(auth(who.token)).send({});
  const reject = (who: Actor, id: unknown) =>
    request(app)
      .post(`/api/v1/overtime/${String(id)}/reject`)
      .set(auth(who.token))
      .send({ reason: 'Not needed' });
  const statusOf = async (id: unknown) => (await OvertimeRequest.findById(id))?.status;

  it("a manager approves a direct report's overtime", async () => {
    const theirs = await requestFor(A);

    expect((await approve(M, theirs._id)).status).toBe(200);
    expect(await statusOf(theirs._id)).toBe('approved');
  });

  it("a manager cannot approve or reject a non-report's overtime: 403 NOT_YOUR_REPORT", async () => {
    const theirs = await requestFor(B);

    for (const decide of [approve, reject]) {
      const res = await decide(M, theirs._id);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_YOUR_REPORT');
    }
    expect(await statusOf(theirs._id)).toBe('pending');
  });

  it('a manager rejecting a report’s overtime works; their own is SELF_APPROVAL', async () => {
    const reports = await requestFor(A);
    const own = await requestFor(M, '2026-03-11');

    expect((await reject(M, reports._id)).status).toBe(200);
    const self = await approve(M, own._id);
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe('SELF_APPROVAL');
  });

  it('hr_executive and hr_manager decide anyone’s overtime (approve_all)', async () => {
    const HRM = await actor('hr_manager');
    const HRE = await actor('hr_executive');
    const forHre = await requestFor(B);
    const forHrm = await requestFor(A, '2026-03-11');

    expect((await approve(HRE, forHre._id)).status).toBe(200);
    expect((await reject(HRM, forHrm._id)).status).toBe(200);
  });

  it('GET /overtime: a manager sees their report and themselves; hr_manager sees all', async () => {
    const HRM = await actor('hr_manager');
    const mine = await requestFor(M, '2026-03-09');
    const reports = await requestFor(A);
    const strangers = await requestFor(B, '2026-03-11');

    const asManager = await request(app).get('/api/v1/overtime').set(auth(M.token));
    expect(asManager.status).toBe(200);
    expect(ids(asManager)).toEqual(sorted(mine, reports));

    const probe = await request(app)
      .get('/api/v1/overtime')
      .query({ employee: String(B.employee._id) })
      .set(auth(M.token));
    expect(probe.body.data).toEqual([]);

    const asHr = await request(app).get('/api/v1/overtime').set(auth(HRM.token));
    expect(ids(asHr)).toEqual(sorted(mine, reports, strangers));
  });

  it('GET /overtime/stats counts only what the caller may see', async () => {
    const HRM = await actor('hr_manager');
    await requestFor(M, '2026-03-09');
    await requestFor(A);
    const strangers = await requestFor(B, '2026-03-11', 5);
    await OvertimeRequest.updateOne({ _id: strangers._id }, { $set: { status: 'approved' } });

    const asManager = await request(app).get('/api/v1/overtime/stats').set(auth(M.token));
    expect(asManager.body.data).toMatchObject({ total: 2, approvedHours: 0 });
    expect(asManager.body.data.byStatus).toMatchObject({ pending: 2, approved: 0 });

    const asHr = await request(app).get('/api/v1/overtime/stats').set(auth(HRM.token));
    expect(asHr.body.data).toMatchObject({ total: 3, approvedHours: 5 });
  });

  it('GET/PATCH/DELETE one request: a manager reaches a report’s, not a stranger’s', async () => {
    const reports = await requestFor(A);
    const stranger = await requestFor(B);
    const url = (row: { _id: unknown }) => `/api/v1/overtime/${String(row._id)}`;

    expect((await request(app).get(url(reports)).set(auth(M.token))).status).toBe(200);
    expect((await request(app).get(url(stranger)).set(auth(M.token))).status).toBe(403);
    expect(
      (await request(app).patch(url(stranger)).set(auth(M.token)).send({ hours: 9 })).status,
    ).toBe(403);
    expect((await request(app).delete(url(stranger)).set(auth(M.token))).status).toBe(403);
    expect(await OvertimeRequest.findById(stranger._id)).not.toBeNull();
  });

  it('filing overtime on someone’s behalf needs them to be your report (or approve_all)', async () => {
    const HRM = await actor('hr_manager');
    const file = (who: Actor, onBehalfOf: Actor) =>
      request(app)
        .post('/api/v1/overtime')
        .set(auth(who.token))
        .send({ employee: String(onBehalfOf.employee._id), date: '2026-03-12', hours: 1, reason: 'x' });

    const forReport = await file(M, A);
    expect(forReport.status).toBe(201);
    expect(String(forReport.body.data.employee)).toBe(String(A.employee._id));

    const forStranger = await file(M, B);
    expect(forStranger.status).toBe(403);
    expect(forStranger.body.error.code).toBe('NOT_YOUR_REPORT');

    expect((await file(HRM, B)).status).toBe(201);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('attendance regularizations', () => {
  const pendingFor = (who: Actor, day = '2026-10-13') =>
    Attendance.create({
      employeeId: who.employee._id,
      date: new Date(`${day}T00:00:00.000Z`),
      status: 'absent',
      regularization: { reason: 'Biometric was down', status: 'pending', requestedAt: new Date() },
    });
  const decide = (who: Actor, id: unknown, status: 'approved' | 'rejected' = 'approved') =>
    request(app).patch(`/api/v1/attendance/regularize/${String(id)}`).set(auth(who.token)).send({ status });
  const list = (who: Actor) => request(app).get('/api/v1/attendance/regularizations').set(auth(who.token));

  it("a manager decides a direct report's regularization", async () => {
    const row = await pendingFor(A);

    const res = await decide(M, row._id);

    expect(res.status).toBe(200);
    expect((await Attendance.findById(row._id))?.regularization?.status).toBe('approved');
  });

  it("a manager cannot decide a non-report's regularization: 403 NOT_YOUR_REPORT", async () => {
    const row = await pendingFor(B);

    for (const status of ['approved', 'rejected'] as const) {
      const res = await decide(M, row._id, status);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('NOT_YOUR_REPORT');
    }
    expect((await Attendance.findById(row._id))?.regularization?.status).toBe('pending');
  });

  it("a manager's own regularization is SELF_APPROVAL, not NOT_YOUR_REPORT", async () => {
    const row = await pendingFor(M);

    const res = await decide(M, row._id);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL');
  });

  it("hr_executive decides a non-report's regularization (attendance.manage)", async () => {
    const HRE = await actor('hr_executive');
    const row = await pendingFor(B);

    const res = await decide(HRE, row._id);

    expect(res.status).toBe(200);
    expect((await Attendance.findById(row._id))?.regularization?.status).toBe('approved');
  });

  it('the queue: a manager sees only their reports’ requests; HR sees all', async () => {
    const HRE = await actor('hr_executive');
    const reports = await pendingFor(A);
    const strangers = await pendingFor(B);
    const own = await pendingFor(M, '2026-10-12');

    const asManager = await list(M);
    expect(asManager.status).toBe(200);
    expect(ids(asManager)).toEqual(sorted(reports));

    expect(ids(await list(HRE))).toEqual(sorted(reports, strangers, own));
    expect((await list(A)).status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('seeded roles', () => {
  const permissionsOf = async (slug: string): Promise<string[]> =>
    (await Role.findOne({ slug }).orFail().lean().exec()).permissions;

  it('ensureSystemRoles gives hr_manager and hr_executive the three approve_all permissions', async () => {
    await ensureSystemRoles();

    for (const slug of ['hr_manager', 'hr_executive']) {
      const perms = await permissionsOf(slug);
      expect(perms).toEqual(
        expect.arrayContaining(['leaves.approve_all', 'expenses.approve_all', 'overtime.approve_all']),
      );
    }
  });

  it('a production role that predates them is refreshed by the next seed run', async () => {
    await ensureSystemRoles();
    await Role.updateOne(
      { slug: 'hr_manager' },
      { $pull: { permissions: { $in: ['leaves.approve_all', 'expenses.approve_all', 'overtime.approve_all'] } } },
    );
    expect(await permissionsOf('hr_manager')).not.toContain('leaves.approve_all');

    const result = await ensureSystemRoles();

    expect(result.refreshed).toBe(1);
    expect(await permissionsOf('hr_manager')).toContain('leaves.approve_all');
  });

  it('manager keeps the plain approve permissions and gains none of the approve_all ones', async () => {
    await ensureSystemRoles();

    const perms = await permissionsOf('manager');
    expect(perms).toEqual(
      expect.arrayContaining(['leaves.approve', 'expenses.approve', 'overtime.approve', 'attendance.approve']),
    );
    expect(perms.filter((perm) => perm.endsWith('.approve_all'))).toEqual([]);
    expect(perms).not.toContain('attendance.manage');
  });
});
