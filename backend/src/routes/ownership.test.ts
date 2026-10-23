/**
 * Ownership and permission gates on the self-service modules: an ordinary
 * employee (A) must not be able to read or act on another employee's (B)
 * records, post company-wide data, or approve their own requests.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { User } from '../models/user.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { HrPolicy } from '../models/hr-policy.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { FieldSite } from '../models/field-site.model.js';
import { Visit } from '../models/visit.model.js';
import { FieldTask } from '../models/field-task.model.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  employee: IEmployee;
}

/** An `employee`-role user with an Employee record and field access. */
async function employeeActor(): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field.view'] } });
  const employee = await createEmployeeFor(user);
  return { token, employee };
}

async function actorWithRole(roleSlug: string): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user);
  return { token, employee };
}

let app: Express;
let A: Actor;
let B: Actor;

beforeEach(async () => {
  app = createApp();
  A = await employeeActor();
  B = await employeeActor();
});

describe('notices and locations are company-wide data', () => {
  it('403 for an employee posting, editing or deleting a notice; reading still works', async () => {
    const post = await request(app)
      .post('/api/v1/notices')
      .set(auth(A.token))
      .send({ title: 'Office closed', content: 'Fake notice' });
    expect(post.status).toBe(403);

    const admin = await actorWithRole('admin');
    const created = await request(app)
      .post('/api/v1/notices')
      .set(auth(admin.token))
      .send({ title: 'Office closed', content: 'Real notice' });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const patch = await request(app)
      .patch(`/api/v1/notices/${id}`)
      .set(auth(A.token))
      .send({ title: 'Hijacked' });
    expect(patch.status).toBe(403);
    const del = await request(app).delete(`/api/v1/notices/${id}`).set(auth(A.token));
    expect(del.status).toBe(403);

    const list = await request(app).get('/api/v1/notices').set(auth(A.token));
    expect(list.status).toBe(200);
  });

  it('403 for an employee creating, editing, deleting or staffing a location', async () => {
    const post = await request(app)
      .post('/api/v1/locations')
      .set(auth(A.token))
      .send({ name: 'HQ', address: '1 Main St' });
    expect(post.status).toBe(403);

    const admin = await actorWithRole('admin');
    const created = await request(app)
      .post('/api/v1/locations')
      .set(auth(admin.token))
      .send({ name: 'HQ', address: '1 Main St' });
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    expect(
      (await request(app).patch(`/api/v1/locations/${id}`).set(auth(A.token)).send({ name: 'x' }))
        .status,
    ).toBe(403);
    expect((await request(app).delete(`/api/v1/locations/${id}`).set(auth(A.token))).status).toBe(
      403,
    );
    expect(
      (
        await request(app)
          .post(`/api/v1/locations/${id}/employees`)
          .set(auth(A.token))
          .send({ employeeIds: [String(A.employee._id)] })
      ).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/locations').set(auth(A.token))).status).toBe(200);
  });
});

describe('overtime', () => {
  it("403 on another employee's request; create ignores body.employee", async () => {
    const theirs = await OvertimeRequest.create({
      employee: B.employee._id,
      date: new Date('2026-03-10'),
      hours: 2,
      reason: 'Release',
    });
    const id = String(theirs._id);

    expect((await request(app).get(`/api/v1/overtime/${id}`).set(auth(A.token))).status).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/overtime/${id}`).set(auth(A.token)).send({ hours: 9 }))
        .status,
    ).toBe(403);
    expect((await request(app).delete(`/api/v1/overtime/${id}`).set(auth(A.token))).status).toBe(
      403,
    );

    const created = await request(app)
      .post('/api/v1/overtime')
      .set(auth(A.token))
      .send({ employee: String(B.employee._id), date: '2026-03-11', hours: 1, reason: 'x' });
    expect(created.status).toBe(201);
    expect(String(created.body.data.employee)).toBe(String(A.employee._id));

    const own = await request(app)
      .get(`/api/v1/overtime/${created.body.data._id}`)
      .set(auth(A.token));
    expect(own.status).toBe(200);
  });

  it('403 SELF_APPROVAL when an approver approves or rejects their own overtime', async () => {
    const manager = await actorWithRole('manager');
    const filed = await request(app)
      .post('/api/v1/overtime')
      .set(auth(manager.token))
      .send({ date: '2026-03-12', hours: 2, reason: 'Release night' });
    expect(filed.status).toBe(201);
    const ownId = filed.body.data._id;

    const approve = await request(app)
      .post(`/api/v1/overtime/${ownId}/approve`)
      .set(auth(manager.token))
      .send({});
    expect(approve.status).toBe(403);
    expect(approve.body.error?.code).toBe('SELF_APPROVAL');

    const reject = await request(app)
      .post(`/api/v1/overtime/${ownId}/reject`)
      .set(auth(manager.token))
      .send({ reason: 'no' });
    expect(reject.status).toBe(403);
    expect(reject.body.error?.code).toBe('SELF_APPROVAL');
    expect((await OvertimeRequest.findById(ownId))?.status).toBe('pending');

    // A direct report's request is still approvable. (A manager decides only
    // for their reports, so A is made to report to this manager.)
    await Employee.updateOne({ _id: A.employee._id }, { $set: { reportingManager: manager.employee._id } });
    const theirs = await OvertimeRequest.create({
      employee: A.employee._id,
      date: new Date('2026-03-13'),
      hours: 1,
      reason: 'Support',
    });
    const ok = await request(app)
      .post(`/api/v1/overtime/${theirs._id}/approve`)
      .set(auth(manager.token))
      .send({});
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('approved');
  });
});

describe('company-wide configuration (expense categories, leave types)', () => {
  it('403 for an employee creating, editing or deleting an expense category', async () => {
    const post = await request(app)
      .post('/api/v1/expense-claims/categories')
      .set(auth(A.token))
      .send({ name: 'Bonus', code: 'BNS', requiresReceipt: false });
    expect(post.status).toBe(403);
    expect(await ExpenseCategory.countDocuments({ code: 'BNS' })).toBe(0);

    const existing = await ExpenseCategory.create({ name: 'Travel', code: 'TRV' });
    const patch = await request(app)
      .patch(`/api/v1/expense-claims/categories/${existing._id}`)
      .set(auth(A.token))
      .send({ limit: 999999 });
    expect(patch.status).toBe(403);
    const del = await request(app)
      .delete(`/api/v1/expense-claims/categories/${existing._id}`)
      .set(auth(A.token));
    expect(del.status).toBe(403);
    expect(await ExpenseCategory.findById(existing._id)).not.toBeNull();

    // Reading the list (to file a claim) still works.
    const list = await request(app).get('/api/v1/expense-claims/categories').set(auth(A.token));
    expect(list.status).toBe(200);
  });

  it('an hr_manager can create an expense category', async () => {
    const hr = await actorWithRole('hr_manager');
    const res = await request(app)
      .post('/api/v1/expense-claims/categories')
      .set(auth(hr.token))
      .send({ name: 'Meals', code: 'MEAL', requiresReceipt: false });
    expect(res.status).toBe(201);
  });

  it('403 for an employee creating a leave type; an hr_manager can', async () => {
    const denied = await request(app)
      .post('/api/v1/leaves/types')
      .set(auth(A.token))
      .send({ name: 'Unlimited', code: 'UL', daysAllowed: 365 });
    expect(denied.status).toBe(403);
    expect(await LeaveType.countDocuments({ code: 'UL' })).toBe(0);

    const hr = await actorWithRole('hr_manager');
    const ok = await request(app)
      .post('/api/v1/leaves/types')
      .set(auth(hr.token))
      .send({ name: 'Casual', code: 'CL', daysAllowed: 12 });
    expect(ok.status).toBe(201);
  });
});

describe('attendance monthly', () => {
  const presentOn = (employee: IEmployee, date: Date) =>
    Attendance.create({ employeeId: employee._id, date, status: 'present' });

  it('ignores ?employeeId= for a caller without attendance.view', async () => {
    await presentOn(A.employee, new Date(2026, 2, 10));
    await presentOn(B.employee, new Date(2026, 2, 11));

    const res = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ year: 2026, month: 3, employeeId: String(B.employee._id) })
      .set(auth(A.token));
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ employeeId: string; isVirtual?: boolean }>;
    expect(rows.filter((r) => !r.isVirtual)).toHaveLength(1);
    for (const row of rows) expect(String(row.employeeId)).toBe(String(A.employee._id));
  });

  it('honours ?employeeId= for a caller with attendance.view', async () => {
    const hr = await actorWithRole('hr_manager');
    await presentOn(B.employee, new Date(2026, 2, 11));
    const res = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ year: 2026, month: 3, employeeId: String(B.employee._id) })
      .set(auth(hr.token));
    expect(res.status).toBe(200);
    const rows = res.body.data as Array<{ employeeId: string; isVirtual?: boolean }>;
    expect(rows.filter((r) => !r.isVirtual)).toHaveLength(1);
    expect(String(rows[0].employeeId)).toBe(String(B.employee._id));
  });
});

describe('expense claims', () => {
  async function category() {
    return ExpenseCategory.findOneAndUpdate(
      { code: 'TRV' },
      { $set: { name: 'Travel', requiresReceipt: false } },
      { upsert: true, new: true },
    ).orFail();
  }
  async function claimFor(employee: IEmployee, status = 'pending') {
    const cat = await category();
    return ExpenseClaim.create({
      employeeId: employee._id,
      category: cat._id,
      amount: 100,
      date: new Date('2026-03-10'),
      status,
    });
  }

  it('createClaim drops a body employeeId that is not the caller', async () => {
    const cat = await category();
    const res = await request(app)
      .post('/api/v1/expense-claims/requests')
      .set(auth(A.token))
      .send({
        employeeId: String(B.employee._id),
        category: String(cat._id),
        amount: 50,
        date: '2026-03-10',
        status: 'draft',
      });
    expect(res.status).toBe(201);
    expect(String(res.body.data.employeeId)).toBe(String(A.employee._id));
    const stored = await ExpenseClaim.findById(res.body.data._id).lean();
    expect(String(stored?.employeeId)).toBe(String(A.employee._id));
  });

  it("403 reading, editing or deleting another employee's claim", async () => {
    const theirs = await claimFor(B.employee);
    const id = String(theirs._id);
    const get = await request(app).get(`/api/v1/expense-claims/requests/${id}`).set(auth(A.token));
    expect(get.status).toBe(403);
    const patch = await request(app)
      .patch(`/api/v1/expense-claims/requests/${id}`)
      .set(auth(A.token))
      .send({ amount: 1 });
    expect(patch.status).toBe(403);
    const del = await request(app)
      .delete(`/api/v1/expense-claims/requests/${id}`)
      .set(auth(A.token));
    expect(del.status).toBe(403);
    expect(await ExpenseClaim.findById(id)).not.toBeNull();
  });

  it('lists only the caller’s own claims without expenses.approve', async () => {
    const mine = await claimFor(A.employee);
    await claimFor(B.employee);
    const res = await request(app)
      .get('/api/v1/expense-claims/requests')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(A.token));
    expect(res.status).toBe(200);
    const ids = (res.body.data as Array<{ _id: string }>).map((c) => c._id);
    expect(ids).toEqual([String(mine._id)]);
  });

  it('400 deleting a claim that is no longer draft or pending', async () => {
    const approved = await claimFor(A.employee, 'approved');
    const res = await request(app)
      .delete(`/api/v1/expense-claims/requests/${approved._id}`)
      .set(auth(A.token));
    expect(res.status).toBe(400);
    expect(await ExpenseClaim.findById(approved._id)).not.toBeNull();
  });

  it('403 SELF_APPROVAL approving or rejecting your own claim', async () => {
    const admin = await actorWithRole('admin');
    const own = await claimFor(admin.employee);
    const approve = await request(app)
      .patch(`/api/v1/expense-claims/requests/${own._id}/approve`)
      .set(auth(admin.token))
      .send({});
    expect(approve.status).toBe(403);
    expect(approve.body.error?.code).toBe('SELF_APPROVAL');
    const reject = await request(app)
      .patch(`/api/v1/expense-claims/requests/${own._id}/reject`)
      .set(auth(admin.token))
      .send({ reason: 'no' });
    expect(reject.status).toBe(403);
    expect(reject.body.error?.code).toBe('SELF_APPROVAL');

    // Someone else's claim is still approvable.
    const theirs = await claimFor(A.employee);
    const ok = await request(app)
      .patch(`/api/v1/expense-claims/requests/${theirs._id}/approve`)
      .set(auth(admin.token))
      .send({});
    expect(ok.status).toBe(200);
  });
});

describe('leaves', () => {
  async function leaveType() {
    return LeaveType.create({ name: 'Casual', code: 'CL', daysAllowed: 12 });
  }

  it('403 applying for leave on behalf of another employee without leaves.update', async () => {
    const type = await leaveType();
    const res = await request(app)
      .post('/api/v1/leaves/requests')
      .set(auth(A.token))
      .send({
        employeeId: String(B.employee._id),
        leaveTypeId: String(type._id),
        startDate: '2026-03-10',
        endDate: '2026-03-10',
        reason: 'x',
      });
    expect(res.status).toBe(403);
    expect(await LeaveRequest.countDocuments({ employeeId: B.employee._id })).toBe(0);
  });

  it('403 SELF_APPROVAL when an approver approves or rejects their own leave', async () => {
    const hr = await actorWithRole('hr_manager');
    const type = await leaveType();
    const own = await LeaveRequest.create({
      employeeId: hr.employee._id,
      leaveTypeId: type._id,
      startDate: new Date('2026-03-10'),
      endDate: new Date('2026-03-10'),
      days: 1,
      reason: 'Holiday',
      status: 'pending',
    });

    const approve = await request(app)
      .patch(`/api/v1/leaves/requests/${own._id}/approve`)
      .set(auth(hr.token));
    expect(approve.status).toBe(403);
    expect(approve.body.error?.code).toBe('SELF_APPROVAL');

    const reject = await request(app)
      .patch(`/api/v1/leaves/requests/${own._id}/reject`)
      .set(auth(hr.token))
      .send({ reason: 'no' });
    expect(reject.status).toBe(403);
    expect(reject.body.error?.code).toBe('SELF_APPROVAL');
    expect((await LeaveRequest.findById(own._id))?.status).toBe('pending');

    // Approving somebody else's leave still works.
    const theirs = await LeaveRequest.create({
      employeeId: A.employee._id,
      leaveTypeId: type._id,
      startDate: new Date('2026-03-12'),
      endDate: new Date('2026-03-12'),
      days: 1,
      reason: 'Holiday',
      status: 'pending',
    });
    const ok = await request(app)
      .patch(`/api/v1/leaves/requests/${theirs._id}/approve`)
      .set(auth(hr.token));
    expect(ok.status).toBe(200);
  });
});

describe('leave reads and cancellation', () => {
  async function leaveType() {
    return LeaveType.create({ name: 'Casual', code: 'CL', daysAllowed: 12 });
  }
  async function leaveFor(employee: IEmployee, typeId: unknown, day: string) {
    return LeaveRequest.create({
      employeeId: employee._id,
      leaveTypeId: typeId,
      startDate: new Date(day),
      endDate: new Date(day),
      days: 1,
      reason: 'Holiday',
      status: 'pending',
    });
  }
  const ids = (res: { body: { data: Array<{ _id: string }> } }) =>
    res.body.data.map((r) => r._id).sort();

  it('an employee lists, reads and sees balances for their own leave only', async () => {
    const type = await leaveType();
    const mine = await leaveFor(A.employee, type._id, '2026-03-10');
    const theirs = await leaveFor(B.employee, type._id, '2026-03-11');
    const myBalance = await LeaveBalance.create({
      employeeId: A.employee._id,
      leaveTypeId: type._id,
      year: 2026,
      allocated: 12,
    });
    await LeaveBalance.create({
      employeeId: B.employee._id,
      leaveTypeId: type._id,
      year: 2026,
      allocated: 12,
    });

    const list = await request(app)
      .get('/api/v1/leaves/requests')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(A.token));
    expect(list.status).toBe(200);
    expect(ids(list)).toEqual([String(mine._id)]);

    const other = await request(app)
      .get(`/api/v1/leaves/requests/${theirs._id}`)
      .set(auth(A.token));
    expect(other.status).toBe(403);
    const own = await request(app).get(`/api/v1/leaves/requests/${mine._id}`).set(auth(A.token));
    expect(own.status).toBe(200);

    const balances = await request(app)
      .get('/api/v1/leaves/balances')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(A.token));
    expect(balances.status).toBe(200);
    expect(ids(balances)).toEqual([String(myBalance._id)]);
  });

  it('a leaves.approve holder (hr_manager) sees every employee', async () => {
    const hr = await actorWithRole('hr_manager');
    const type = await leaveType();
    const mine = await leaveFor(A.employee, type._id, '2026-03-10');
    const theirs = await leaveFor(B.employee, type._id, '2026-03-11');
    await LeaveBalance.create({ employeeId: A.employee._id, leaveTypeId: type._id, year: 2026 });
    await LeaveBalance.create({ employeeId: B.employee._id, leaveTypeId: type._id, year: 2026 });

    const list = await request(app).get('/api/v1/leaves/requests').set(auth(hr.token));
    expect(ids(list)).toEqual([String(mine._id), String(theirs._id)].sort());
    const filtered = await request(app)
      .get('/api/v1/leaves/requests')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(hr.token));
    expect(ids(filtered)).toEqual([String(theirs._id)]);
    const get = await request(app).get(`/api/v1/leaves/requests/${theirs._id}`).set(auth(hr.token));
    expect(get.status).toBe(200);
    const balances = await request(app).get('/api/v1/leaves/balances').set(auth(hr.token));
    expect(balances.body.data).toHaveLength(2);
  });

  it('a caller without an employee record gets empty lists, not an error', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    const type = await leaveType();
    await leaveFor(A.employee, type._id, '2026-03-10');
    const list = await request(app).get('/api/v1/leaves/requests').set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data).toEqual([]);
    const balances = await request(app).get('/api/v1/leaves/balances').set(auth(token));
    expect(balances.status).toBe(200);
    expect(balances.body.data).toEqual([]);
  });

  it("403 cancelling another employee's leave; cancelling your own still works", async () => {
    const type = await leaveType();
    const theirs = await leaveFor(B.employee, type._id, '2026-03-11');
    const denied = await request(app)
      .patch(`/api/v1/leaves/requests/${theirs._id}/cancel`)
      .set(auth(A.token));
    expect(denied.status).toBe(403);
    expect((await LeaveRequest.findById(theirs._id))?.status).toBe('pending');

    const mine = await leaveFor(A.employee, type._id, '2026-03-10');
    const ok = await request(app)
      .patch(`/api/v1/leaves/requests/${mine._id}/cancel`)
      .set(auth(A.token));
    expect(ok.status).toBe(200);
    expect(ok.body.data.status).toBe('cancelled');
  });
});

describe('malformed employee ids', () => {
  it('400 (not 500) for a non-ObjectId employeeId', async () => {
    const admin = await actorWithRole('admin');
    const monthly = await request(app)
      .get('/api/v1/attendance/monthly')
      .query({ year: 2026, month: 3, employeeId: 'not-an-id' })
      .set(auth(admin.token));
    expect(monthly.status).toBe(400);

    const claims = await request(app)
      .get('/api/v1/expense-claims/requests')
      .query({ employeeId: 'not-an-id' })
      .set(auth(admin.token));
    expect(claims.status).toBe(400);

    const leaves = await request(app)
      .get('/api/v1/leaves/requests')
      .query({ employeeId: 'not-an-id' })
      .set(auth(admin.token));
    expect(leaves.status).toBe(400);
  });
});

describe('hr policy acknowledgement', () => {
  it('records the acknowledgement for the caller, ignoring body.employee', async () => {
    const policy = await HrPolicy.create({
      policyCode: 'POL-0001',
      title: 'Code of conduct',
      status: 'published',
    });
    const res = await request(app)
      .post(`/api/v1/hr-policies/${policy._id}/acknowledge`)
      .set(auth(A.token))
      .send({ employee: String(B.employee._id) });
    expect(res.status).toBe(200);

    const stored = await HrPolicy.findById(policy._id).lean();
    const ackedBy = (stored?.acknowledgements ?? []).map((a) => String(a.employee));
    expect(ackedBy).toEqual([String(A.employee._id)]);
  });

  it('a policies.manage holder (hr_manager) records an acknowledgement on behalf of body.employee', async () => {
    const hr = await actorWithRole('hr_manager');
    const policy = await HrPolicy.create({
      policyCode: 'POL-0002',
      title: 'Leave policy',
      status: 'published',
    });
    const res = await request(app)
      .post(`/api/v1/hr-policies/${policy._id}/acknowledge`)
      .set(auth(hr.token))
      .send({ employee: String(B.employee._id), comment: 'Signed paper copy' });
    expect(res.status).toBe(200);

    const stored = await HrPolicy.findById(policy._id).lean();
    const ackedBy = (stored?.acknowledgements ?? []).map((a) => String(a.employee));
    expect(ackedBy).toEqual([String(B.employee._id)]);

    // Without body.employee the same caller acknowledges for themselves.
    const self = await request(app)
      .post(`/api/v1/hr-policies/${policy._id}/acknowledge`)
      .set(auth(hr.token))
      .send({});
    expect(self.status).toBe(200);
    const after = await HrPolicy.findById(policy._id).lean();
    expect((after?.acknowledgements ?? []).map((a) => String(a.employee)).sort()).toEqual(
      [String(B.employee._id), String(hr.employee._id)].sort(),
    );
  });

  it("who acknowledged is HR's: others see only their own acknowledgement", async () => {
    const policy = await HrPolicy.create({ policyCode: 'POL-0009', title: 'IT policy', status: 'published' });
    for (const who of [A, B]) {
      // eslint-disable-next-line no-await-in-loop
      const ack = await request(app).post(`/api/v1/hr-policies/${policy._id}/acknowledge`).set(auth(who.token)).send({});
      expect(ack.status).toBe(200);
      const own = (ack.body.data.acknowledgements as Array<{ employee: { _id: string } }>).map((a) => a.employee._id);
      expect(own).toEqual([String(who.employee._id)]);
    }
    const ackedBy = (body: { acknowledgements: Array<{ employee: { _id: string } | string }> }) =>
      body.acknowledgements.map((a) => (typeof a.employee === 'object' ? a.employee._id : a.employee)).sort();

    const asA = await request(app).get(`/api/v1/hr-policies/${policy._id}`).set(auth(A.token));
    expect(asA.status).toBe(200);
    expect(ackedBy(asA.body.data)).toEqual([String(A.employee._id)]);
    const listA = await request(app).get(`/api/v1/hr-policies/${policy._id}/acknowledgements`).set(auth(A.token));
    expect(ackedBy(listA.body.data)).toEqual([String(A.employee._id)]);

    const hr = await actorWithRole('hr_manager');
    const asHr = await request(app).get(`/api/v1/hr-policies/${policy._id}`).set(auth(hr.token));
    expect(ackedBy(asHr.body.data)).toEqual([String(A.employee._id), String(B.employee._id)].sort());
    const listHr = await request(app).get(`/api/v1/hr-policies/${policy._id}/acknowledgements`).set(auth(hr.token));
    expect(ackedBy(listHr.body.data)).toHaveLength(2);
  });

  it('404 when a policies.manage holder names an employee that does not exist', async () => {
    const hr = await actorWithRole('hr_manager');
    const policy = await HrPolicy.create({
      policyCode: 'POL-0003',
      title: 'Travel policy',
      status: 'published',
    });
    const res = await request(app)
      .post(`/api/v1/hr-policies/${policy._id}/acknowledge`)
      .set(auth(hr.token))
      .send({ employee: '0123456789abcdef01234567' });
    expect(res.status).toBe(404);
    expect((await HrPolicy.findById(policy._id).lean())?.acknowledgements ?? []).toHaveLength(0);
  });
});

describe('leave calendar', () => {
  it('shows an employee who is off, but not the reason, attachments or comments', async () => {
    const type = await LeaveType.create({ name: 'Sick', code: 'SL', daysAllowed: 10, color: '#ff0000' });
    await LeaveRequest.create({
      employeeId: B.employee._id,
      leaveTypeId: type._id,
      startDate: new Date('2026-03-10'),
      endDate: new Date('2026-03-11'),
      days: 2,
      reason: 'Hospital appointment — chemotherapy',
      attachments: [{ name: 'certificate.pdf', fileUrl: '/uploads/documents/medical-certificate.pdf' }],
      rejectedReason: 'n/a',
      status: 'approved',
    });
    const range = { from: '2026-03-01', to: '2026-03-31' };

    const res = await request(app)
      .get('/api/v1/leaves/requests/calendar')
      .query(range)
      .set(auth(A.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const row = res.body.data[0];
    expect(row).not.toHaveProperty('reason');
    expect(row).not.toHaveProperty('attachments');
    expect(row).not.toHaveProperty('comments');
    expect(row).not.toHaveProperty('rejectedReason');
    expect(row).not.toHaveProperty('approvedBy');
    expect(JSON.stringify(res.body)).not.toContain('chemotherapy');
    expect(row).toMatchObject({ days: 2, isHalfDay: false, status: 'approved' });
    expect(row.employeeId).toMatchObject({ firstName: 'Test' });
    expect(row.employeeId).not.toHaveProperty('email');
    expect(row.leaveTypeId).toMatchObject({ name: 'Sick' });

    // HR still sees the full request.
    const hr = await actorWithRole('hr_manager');
    const full = await request(app)
      .get('/api/v1/leaves/requests/calendar')
      .query(range)
      .set(auth(hr.token));
    expect(full.status).toBe(200);
    expect(full.body.data[0].reason).toBe('Hospital appointment — chemotherapy');
    expect(full.body.data[0]).toHaveProperty('attachments');
  });
});

describe('field module', () => {
  async function visitFor(employee: IEmployee) {
    const site = await FieldSite.create({ name: 'Acme', type: 'Branch', assignedTo: [employee._id] });
    return Visit.create({
      employeeId: employee._id,
      siteId: site._id,
      purpose: 'Meeting',
      status: 'completed',
      checkIn: { time: new Date(Date.now() - 3_600_000) },
      checkOut: { time: new Date() },
    });
  }

  it("403 reading, editing or checking out another employee's visit", async () => {
    const theirs = await visitFor(B.employee);
    const id = String(theirs._id);
    expect((await request(app).get(`/api/v1/field/visits/${id}`).set(auth(A.token))).status).toBe(
      403,
    );
    const patch = await request(app)
      .patch(`/api/v1/field/visits/${id}/report`)
      .set(auth(A.token))
      .send({ notes: 'x' });
    expect(patch.status).toBe(403);
    expect(
      (
        await request(app)
          .post(`/api/v1/field/visits/${id}/check-out`)
          .set(auth(A.token))
          .send({ checkOut: {} })
      ).status,
    ).toBe(403);

    const mine = await visitFor(A.employee);
    expect(
      (await request(app).get(`/api/v1/field/visits/${mine._id}`).set(auth(A.token))).status,
    ).toBe(200);
  });

  it('a report edit ignores a body employeeId from a rep (cannot hand a visit to someone else)', async () => {
    const mine = await visitFor(A.employee);
    const res = await request(app)
      .patch(`/api/v1/field/visits/${mine._id}/report`)
      .set(auth(A.token))
      .send({ employeeId: String(B.employee._id), notes: 'moved?' });
    expect(res.status).toBe(200);
    expect(String(res.body.data.employeeId)).toBe(String(A.employee._id));
    const stored = await Visit.findById(mine._id).lean();
    expect(String(stored?.employeeId)).toBe(String(A.employee._id));
    expect(stored?.report?.notes).toBe('moved?');
  });

  it('lists only the caller’s own visits and ignores ?employeeId=', async () => {
    const mine = await visitFor(A.employee);
    await visitFor(B.employee);
    const res = await request(app)
      .get('/api/v1/field/visits')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(A.token));
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ _id: string }>).map((v) => v._id)).toEqual([String(mine._id)]);
  });

  it('a rep cannot plan a visit for someone who is not their direct report', async () => {
    const site = await FieldSite.create({ name: 'Acme', type: 'Branch', assignedTo: [A.employee._id, B.employee._id] });
    const tomorrow = new Date(Date.now() + 86_400_000 + 19_800_000).toISOString().slice(0, 10);
    const forB = await request(app)
      .post('/api/v1/field/visits/plan')
      .set(auth(A.token))
      .send({ employeeId: String(B.employee._id), siteId: String(site._id), plannedDate: tomorrow, purpose: 'Meeting' });
    expect(forB.status).toBe(403);
    const visit = await request(app)
      .post('/api/v1/field/visits/plan')
      .set(auth(A.token))
      .send({ siteId: String(site._id), plannedDate: tomorrow, purpose: 'Meeting' });
    expect(visit.status).toBe(201);
    expect(String(visit.body.data.employeeId)).toBe(String(A.employee._id));
    // ...and B cannot read it.
    expect((await request(app).get(`/api/v1/field/visits/${visit.body.data._id}`).set(auth(B.token))).status).toBe(403);
  });

  it("403 on another employee's task and day route", async () => {
    const task = await FieldTask.create({ title: 'Deliver', assignedTo: B.employee._id });
    const id = String(task._id);
    expect((await request(app).get(`/api/v1/field/tasks/${id}`).set(auth(A.token))).status).toBe(
      403,
    );
    expect(
      (await request(app).patch(`/api/v1/field/tasks/${id}/accept`).set(auth(A.token))).status,
    ).toBe(403);
    expect(
      (await request(app).patch(`/api/v1/field/tasks/${id}/complete`).set(auth(A.token)).send({}))
        .status,
    ).toBe(403);
    expect((await FieldTask.findById(id))?.status).toBe('new');

    const team = await request(app).get('/api/v1/field/tasks/team').set(auth(A.token));
    expect(team.status).toBe(200);
    expect(team.body.data).toEqual([]);

    const route = await request(app).get(`/api/v1/field/route/${B.employee._id}`).set(auth(A.token));
    expect(route.status).toBe(403);

    const own = await request(app).get(`/api/v1/field/route/${A.employee._id}`).set(auth(A.token));
    expect(own.status).toBe(200);
  });

  it('a field.manage holder keeps cross-employee access', async () => {
    const admin = await actorWithRole('admin');
    const theirs = await visitFor(B.employee);
    expect(
      (await request(app).get(`/api/v1/field/visits/${theirs._id}`).set(auth(admin.token))).status,
    ).toBe(200);
    const list = await request(app)
      .get('/api/v1/field/visits')
      .query({ employeeId: String(B.employee._id) })
      .set(auth(admin.token));
    expect((list.body.data as Array<{ _id: string }>).map((v) => v._id)).toEqual([
      String(theirs._id),
    ]);
  });
});
