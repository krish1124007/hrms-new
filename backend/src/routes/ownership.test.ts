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
import type { IEmployee } from '../models/employee.model.js';
import { Attendance } from '../models/attendance.model.js';
import { ExpenseCategory } from '../models/expense-category.model.js';
import { ExpenseClaim } from '../models/expense-claim.model.js';
import { LeaveType } from '../models/leave-type.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { HrPolicy } from '../models/hr-policy.model.js';
import { OvertimeRequest } from '../models/overtime-request.model.js';
import { Client } from '../models/client.model.js';
import { Visit } from '../models/visit.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { LocationTrack } from '../models/location-track.model.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

interface Actor {
  token: string;
  employee: IEmployee;
}

/** An `employee`-role user with an Employee record and field-sales access. */
async function employeeActor(): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['field-sales.view'] } });
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
});

describe('field module', () => {
  async function visitFor(employee: IEmployee) {
    const client = await Client.create({ name: 'Acme' });
    return Visit.create({
      employeeId: employee._id,
      clientId: client._id,
      status: 'in_progress',
      checkIn: { time: new Date() },
    });
  }

  it("403 reading, editing or checking out another employee's visit", async () => {
    const theirs = await visitFor(B.employee);
    const id = String(theirs._id);
    expect((await request(app).get(`/api/v1/field/visits/${id}`).set(auth(A.token))).status).toBe(
      403,
    );
    const patch = await request(app)
      .patch(`/api/v1/field/visits/${id}`)
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

  it('createVisit / createOrder / createPayment ignore a body employeeId', async () => {
    const client = await Client.create({ name: 'Acme' });
    const visit = await request(app)
      .post('/api/v1/field/visits')
      .set(auth(A.token))
      .send({ employeeId: String(B.employee._id), clientId: String(client._id) });
    expect(visit.status).toBe(201);
    expect(String(visit.body.data.employeeId)).toBe(String(A.employee._id));

    const order = await request(app)
      .post('/api/v1/field/orders')
      .set(auth(A.token))
      .send({
        employeeId: String(B.employee._id),
        clientId: String(client._id),
        items: [{ name: 'Widget', quantity: 1, unitPrice: 10, total: 10 }],
      });
    expect(order.status).toBe(201);
    expect(String(order.body.data.employeeId)).toBe(String(A.employee._id));

    const payment = await request(app)
      .post('/api/v1/field/payments')
      .set(auth(A.token))
      .send({
        employeeId: String(B.employee._id),
        clientId: String(client._id),
        amount: 10,
        method: 'cash',
      });
    expect(payment.status).toBe(201);
    expect(String(payment.body.data.employeeId)).toBe(String(A.employee._id));

    // ...and B cannot read A's order or payment.
    expect(
      (await request(app).get(`/api/v1/field/orders/${order.body.data._id}`).set(auth(B.token)))
        .status,
    ).toBe(403);
    expect(
      (await request(app).get(`/api/v1/field/payments/${payment.body.data._id}`).set(auth(B.token)))
        .status,
    ).toBe(403);
  });

  it("403 on another employee's task, timeline and tracking history", async () => {
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

    await LocationTrack.create({
      employeeId: B.employee._id,
      location: { type: 'Point', coordinates: [72.8, 19.0] },
    });
    const history = await request(app)
      .get(`/api/v1/field/tracking/history/${B.employee._id}`)
      .set(auth(A.token));
    expect(history.status).toBe(403);
    const timeline = await request(app)
      .get(`/api/v1/field/visits/timeline/${B.employee._id}`)
      .set(auth(A.token));
    expect(timeline.status).toBe(403);
    const live = await request(app).get('/api/v1/field/tracking/live').set(auth(A.token));
    expect(live.status).toBe(200);
    expect(live.body.data).toEqual([]);

    const own = await request(app)
      .get(`/api/v1/field/tracking/history/${A.employee._id}`)
      .set(auth(A.token));
    expect(own.status).toBe(200);
  });

  it('a field-sales.manage holder keeps cross-employee access', async () => {
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
