/**
 * Employee lifecycle: scheduled exits, restore, safe updates, and an import
 * that gives every new employee a login.
 *
 * A status change with a future exit date used to deactivate the employee and
 * their login on the spot; now it only schedules the exit, and the nightly
 * day-close applies it once the day has passed — cancelling the leave they
 * can no longer take and telling HR what to recover. PATCH used to be a raw
 * `findByIdAndUpdate` (a partial salary wiped the rest, the login kept the old
 * e-mail, anyone could report to themselves), and import created employees
 * nobody could sign in as.
 *
 * The clock is pinned to Wed 14 Oct 2026, 12:00 IST. October 2026 under the
 * default week-off rule (Sunday + 4th Saturday):
 *   Tue 13 · Wed 14 (today) · … · Mon 19 · Tue 20 · Wed 21 · Thu 22 · Fri 23
 *   Sat 24 (4th Sat, off) · Sun 25 · Mon 26 · Tue 27
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp } from '../app.js';
import { createUser, createEmployeeFor } from '../test/factories.js';
import { sendMail } from '../services/email.service.js';
import { invalidateWeekOffRule } from '../services/week-off.service.js';
import { applyScheduledExits, closeBusinessDay } from '../services/day-close.service.js';
import { Asset } from '../models/asset.model.js';
import { AuditLog } from '../models/audit-log.model.js';
import { Attendance } from '../models/attendance.model.js';
import { Employee, type IEmployee } from '../models/employee.model.js';
import { LeaveBalance } from '../models/leave-balance.model.js';
import { LeaveRequest } from '../models/leave-request.model.js';
import { LeaveType, type ILeaveType } from '../models/leave-type.model.js';
import { Loan } from '../models/loan.model.js';
import { Notification } from '../models/notification.model.js';
import { User, type IUser } from '../models/user.model.js';

vi.mock('../services/email.service.js', () => ({
  sendMail: vi.fn(async () => true),
}));

const NOW = new Date('2026-10-14T06:30:00.000Z');
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const label = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);
const ist = (iso: string, hhmm: string): Date => new Date(`${iso}T${hhmm}:00.000+05:30`);

interface Actor {
  user: IUser;
  token: string;
  employee: IEmployee;
}

async function actor(roleSlug: string, fields: Record<string, unknown> = {}): Promise<Actor> {
  const { user, token } = await createUser({ roleSlug });
  const employee = await createEmployeeFor(user, fields);
  return { user, token, employee };
}

let app: Express;
let hr: Actor;
let emp: Actor;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  invalidateWeekOffRule();
  app = createApp();
  hr = await actor('hr_manager');
  emp = await actor('employee', { confirmationDate: new Date('2025-01-01') });
});

afterEach(() => {
  vi.useRealTimers();
});

const employeeNow = async (who: Actor) => (await Employee.findById(who.employee._id).lean().exec())!;
const userNow = async (who: Actor) => (await User.findById(who.user._id).lean().exec())!;

function setStatus(who: Actor, body: Record<string, unknown>) {
  return request(app).patch(`/api/v1/employees/${who.employee._id}/status`).set(auth(hr.token)).send(body);
}

function patch(who: Actor, body: Record<string, unknown>) {
  return request(app).patch(`/api/v1/employees/${who.employee._id}`).set(auth(hr.token)).send(body);
}

async function leaveType(): Promise<ILeaveType> {
  return LeaveType.create({ name: 'Casual Leave', code: 'CL', daysAllowed: 12 });
}

/** The employee applies for leave and HR approves it (rows stamped, balance charged). */
async function approvedLeave(type: ILeaveType, startDate: string, endDate: string): Promise<string> {
  const applied = await request(app)
    .post('/api/v1/leaves/requests')
    .set(auth(emp.token))
    .send({ leaveTypeId: String(type._id), startDate, endDate, reason: 'Family function' });
  expect(applied.status).toBe(201);
  const approved = await request(app)
    .patch(`/api/v1/leaves/requests/${applied.body.data._id}/approve`)
    .set(auth(hr.token));
  expect(approved.status).toBe(200);
  return applied.body.data._id as string;
}

async function usedOf(type: ILeaveType): Promise<number | undefined> {
  const bal = await LeaveBalance.findOne({ employeeId: emp.employee._id, leaveTypeId: type._id, year: 2026 }).lean();
  return bal?.used;
}

describe('PATCH /employees/:id/status — scheduled exits', () => {
  it('a resignation with an exit date next week keeps the employee and the login active until then', async () => {
    const res = await setStatus(emp, { status: 'resigned', exitDate: '2026-10-21', reason: 'Moving cities' });

    expect(res.status).toBe(200);
    const after = await employeeNow(emp);
    expect(after.status).toBe('active');
    expect(after.exitStatus).toBe('resigned');
    expect(after.exitDate?.toISOString().slice(0, 10)).toBe('2026-10-21');
    expect(after.exitReason).toBe('Moving cities');
    expect((await userNow(emp)).status).toBe('active');
  });

  it('a termination without an exit date applies at once', async () => {
    const res = await setStatus(emp, { status: 'terminated', reason: 'Misconduct' });

    expect(res.status).toBe(200);
    expect((await employeeNow(emp)).status).toBe('terminated');
    expect((await userNow(emp)).status).toBe('inactive');
  });

  it('an exit date of today applies at once', async () => {
    await setStatus(emp, { status: 'resigned', exitDate: '2026-10-14' });

    expect((await employeeNow(emp)).status).toBe('resigned');
    expect((await userNow(emp)).status).toBe('inactive');
  });

  it('serving notice with a future exit date: on notice now, resigned on the exit date', async () => {
    await setStatus(emp, { status: 'onNotice', exitDate: '2026-11-13' });

    const after = await employeeNow(emp);
    expect(after.status).toBe('onNotice');
    expect(after.exitStatus).toBe('resigned');
    expect((await userNow(emp)).status).toBe('active');
  });

  it('exitDate: null is no date (not 1 Jan 1970): on notice with nothing scheduled, and nothing applied', async () => {
    const res = await setStatus(emp, { status: 'onNotice', exitDate: null });

    expect(res.status).toBe(200);
    const after = await employeeNow(emp);
    expect(after.status).toBe('onNotice');
    expect(after.exitDate).toBeFalsy();
    expect(after.exitStatus).toBeFalsy();
    expect((await applyScheduledExits(label('2026-10-14'))).exitsApplied).toBe(0);
    expect((await employeeNow(emp)).status).toBe('onNotice');
  });

  it('setting the employee active again clears a scheduled exit', async () => {
    await setStatus(emp, { status: 'terminated', exitDate: '2026-10-21' });
    await setStatus(emp, { status: 'active' });

    const after = await employeeNow(emp);
    expect(after.status).toBe('active');
    expect(after.exitDate).toBeFalsy();
    expect(after.exitStatus).toBeFalsy();
    await applyScheduledExits(label('2026-10-22'));
    expect((await employeeNow(emp)).status).toBe('active');
  });
});

describe('applyScheduledExits', () => {
  it('after the exit date: resigned, login off, future approved leave cancelled and refunded, HR told what to recover', async () => {
    const cl = await leaveType();
    await setStatus(emp, { status: 'resigned', exitDate: '2026-10-21' });
    const before = await approvedLeave(cl, '2026-10-19', '2026-10-20'); // before the exit: stays
    const after = await approvedLeave(cl, '2026-10-26', '2026-10-27'); // after the exit: cancelled
    expect(await usedOf(cl)).toBe(4);
    await Asset.create({ name: 'MacBook Pro', assetCode: 'LAP-001', category: 'laptop', status: 'assigned', assignedTo: emp.employee._id });
    await Loan.create({
      loanNumber: 'LN-0001',
      employee: emp.employee._id,
      principalAmount: 50000,
      tenureMonths: 10,
      emiAmount: 5000,
      totalPayable: 50000,
      status: 'active',
      outstandingTotal: 30000,
    });
    await Loan.create({
      loanNumber: 'LN-0002',
      employee: emp.employee._id,
      principalAmount: 1000,
      tenureMonths: 1,
      emiAmount: 1000,
      totalPayable: 1000,
      status: 'closed',
    });

    const result = await applyScheduledExits(label('2026-10-22'));

    expect(result.exitsApplied).toBe(1);
    expect(result.failures).toEqual([]);
    expect((await employeeNow(emp)).status).toBe('resigned');
    expect((await userNow(emp)).status).toBe('inactive');

    const cancelled = await LeaveRequest.findById(after).lean();
    expect(cancelled?.status).toBe('cancelled');
    expect(cancelled?.cancelReason).toBe('Employee exited');
    expect((await LeaveRequest.findById(before).lean())?.status).toBe('approved');
    expect(await usedOf(cl)).toBe(2);
    const rows = await Attendance.find({ employeeId: emp.employee._id }).sort({ date: 1 }).lean();
    expect(rows.map((r) => r.date.toISOString().slice(0, 10))).toEqual(['2026-10-19', '2026-10-20']);

    const notes = await Notification.find({ userId: hr.user._id, type: 'system_alert' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0]!.message).toContain('MacBook Pro');
    expect(notes[0]!.message).toContain('LN-0001');
    expect(notes[0]!.message).not.toContain('LN-0002');
    expect(await Notification.countDocuments({ userId: emp.user._id, type: 'system_alert' })).toBe(0);
  });

  it('rejects pending leave starting after the exit day ("Employee exited"); pending leave before it stays pending', async () => {
    const cl = await leaveType();
    await setStatus(emp, { status: 'resigned', exitDate: '2026-10-21' });
    const apply = (startDate: string, endDate: string) =>
      request(app)
        .post('/api/v1/leaves/requests')
        .set(auth(emp.token))
        .send({ leaveTypeId: String(cl._id), startDate, endDate, reason: 'Family function' });
    const before = await apply('2026-10-19', '2026-10-19');
    const after = await apply('2026-10-26', '2026-10-27');
    expect(before.status).toBe(201);
    expect(after.status).toBe(201);

    expect((await applyScheduledExits(label('2026-10-22'))).exitsApplied).toBe(1);

    const rejected = await LeaveRequest.findById(after.body.data._id).lean();
    expect(rejected?.status).toBe('rejected');
    expect(rejected?.rejectedReason).toBe('Employee exited');
    expect((await LeaveRequest.findById(before.body.data._id).lean())?.status).toBe('pending');
  });

  it('applies the scheduled status (terminated) and is idempotent', async () => {
    await setStatus(emp, { status: 'terminated', exitDate: '2026-10-21' });

    expect((await applyScheduledExits(label('2026-10-21'))).exitsApplied).toBe(1);
    expect((await applyScheduledExits(label('2026-10-22'))).exitsApplied).toBe(0);

    expect((await employeeNow(emp)).status).toBe('terminated');
    expect(await Notification.countDocuments({ userId: hr.user._id, type: 'system_alert' })).toBe(1);
  });

  it('leaves an employee whose exit date has not come yet alone', async () => {
    await setStatus(emp, { status: 'resigned', exitDate: '2026-10-21' });

    expect((await applyScheduledExits(label('2026-10-20'))).exitsApplied).toBe(0);
    expect((await employeeNow(emp)).status).toBe('active');
  });

  it('closeBusinessDay applies the exits after the attendance work, and counts them (dry run writes nothing)', async () => {
    await Employee.updateOne({ _id: emp.employee._id }, { $set: { exitDate: label('2026-10-13'), exitStatus: 'resigned' } });

    const dry = await closeBusinessDay(ist('2026-10-13', '23:59'), { dryRun: true });
    expect(dry.exitsApplied).toBe(1);
    expect((await employeeNow(emp)).status).toBe('active');

    const counts = await closeBusinessDay(ist('2026-10-13', '23:59'));
    expect(counts.exitsApplied).toBe(1);
    // The last working day still got its row before the exit was applied.
    expect(await Attendance.countDocuments({ employeeId: emp.employee._id, date: label('2026-10-13') })).toBe(1);
    expect((await employeeNow(emp)).status).toBe('resigned');
    expect((await userNow(emp)).status).toBe('inactive');
  });
});

describe('POST /employees/:id/restore', () => {
  it('brings a soft-deleted employee back into the list and reactivates the login', async () => {
    const del = await request(app).delete(`/api/v1/employees/${emp.employee._id}`).set(auth(hr.token));
    expect(del.status).toBe(200);
    expect((await userNow(emp)).status).toBe('inactive');

    const res = await request(app).post(`/api/v1/employees/${emp.employee._id}/restore`).set(auth(hr.token));

    expect(res.status).toBe(200);
    const list = await request(app).get('/api/v1/employees').set(auth(hr.token));
    expect(list.body.data.map((e: { _id: string }) => e._id)).toContain(String(emp.employee._id));
    expect((await userNow(emp)).status).toBe('active');
  });

  it('404 for an unknown employee; 409 for one that is not deleted', async () => {
    const unknown = await request(app).post('/api/v1/employees/64b000000000000000000000/restore').set(auth(hr.token));
    expect(unknown.status).toBe(404);
    const live = await request(app).post(`/api/v1/employees/${emp.employee._id}/restore`).set(auth(hr.token));
    expect(live.status).toBe(409);
  });

  it('needs employees.delete — the permission that deleted them; employees.update (hr_executive) is not enough', async () => {
    const hrExec = await actor('hr_executive');
    expect((await request(app).delete(`/api/v1/employees/${emp.employee._id}`).set(auth(hr.token))).status).toBe(200);

    const asEmployee = await request(app).post(`/api/v1/employees/${hr.employee._id}/restore`).set(auth(emp.token));
    const asHrExec = await request(app).post(`/api/v1/employees/${emp.employee._id}/restore`).set(auth(hrExec.token));

    expect(asEmployee.status).toBe(403);
    expect(asHrExec.status).toBe(403);
    expect(await Employee.findById(emp.employee._id).lean()).toBeNull();
  });

  it('keeps an invited login invited (only a deactivated one is reactivated)', async () => {
    await User.updateOne({ _id: emp.user._id }, { $set: { status: 'invited' } });
    await Employee.updateOne({ _id: emp.employee._id }, { $set: { isDeleted: true, deletedAt: new Date() } }).setOptions({
      withDeleted: true,
    });

    const res = await request(app).post(`/api/v1/employees/${emp.employee._id}/restore`).set(auth(hr.token));

    expect(res.status).toBe(200);
    expect((await userNow(emp)).status).toBe('invited');
  });
});

describe('PATCH /employees/:id — safe updates', () => {
  it('a partial salary keeps the other components and recomputes the gross', async () => {
    await patch(emp, { salary: { basic: 30000, hra: 12000, da: 0, specialAllowance: 3000 } });

    const res = await patch(emp, { salary: { hra: 1 } });

    expect(res.status).toBe(200);
    const after = await employeeNow(emp);
    expect(after.salary.basic).toBe(30000);
    expect(after.salary.hra).toBe(1);
    expect(after.salary.specialAllowance).toBe(3000);
    expect(after.salary.grossSalary).toBe(33001);
  });

  it('changing the e-mail changes the login e-mail too', async () => {
    const res = await patch(emp, { email: 'New.Address@Test.Local' });

    expect(res.status).toBe(200);
    expect((await employeeNow(emp)).email).toBe('new.address@test.local');
    expect((await userNow(emp)).email).toBe('new.address@test.local');
  });

  it("an e-mail another login already uses is 409, and nothing changes", async () => {
    const res = await patch(emp, { email: hr.user.email });

    expect(res.status).toBe(409);
    expect((await employeeNow(emp)).email).toBe(emp.user.email);
    expect((await userNow(emp)).email).toBe(emp.user.email);
  });

  it('an employee cannot report to themselves', async () => {
    const res = await patch(emp, { reportingManager: String(emp.employee._id) });

    expect(res.status).toBe(400);
    expect((await employeeNow(emp)).reportingManager).toBeFalsy();
  });

  it('a reporting cycle is refused (A → B, then B → A)', async () => {
    const lead = await actor('manager');
    expect((await patch(emp, { reportingManager: String(lead.employee._id) })).status).toBe(200);

    const res = await patch(lead, { reportingManager: String(emp.employee._id) });

    expect(res.status).toBe(400);
    expect((await Employee.findById(lead.employee._id).lean())?.reportingManager).toBeFalsy();
  });

  it('a manager that does not exist is 400', async () => {
    const res = await patch(emp, { reportingManager: '64b000000000000000000000' });
    expect(res.status).toBe(400);
  });
});

describe('POST /employees/import — creates logins', () => {
  it('2 rows → 2 employees, 2 invited logins, 2 invitation mails, and a per-row report', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [
          { firstName: 'Imp', lastName: 'One', email: 'imp.one@test.local', joiningDate: '2026-07-15', employeeId: 'DD-0042' },
          { firstName: 'Imp', lastName: 'Two', email: 'Imp.Two@test.local', joiningDate: '2024-02-01' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.created).toBe(2);
    expect(res.body.data.rows).toEqual([
      { row: 1, email: 'imp.one@test.local', employeeId: 'DD-0042', status: 'created', message: expect.any(String) },
      { row: 2, email: 'imp.two@test.local', status: 'created', message: expect.any(String) },
    ]);

    const one = await Employee.findOne({ email: 'imp.one@test.local' }).lean();
    const two = await Employee.findOne({ email: 'imp.two@test.local' }).lean();
    expect(one?.employeeId).toBe('DD-0042');
    expect(two?.employeeId).toMatch(/^EMP\d{6}$/);

    const users = await User.find({ email: { $in: ['imp.one@test.local', 'imp.two@test.local'] } })
      .select('+emailVerificationToken')
      .lean();
    expect(users).toHaveLength(2);
    for (const u of users) {
      expect(u.status).toBe('invited');
      expect(u.emailVerificationToken).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(String(one?.userId)).toBe(String(users.find((u) => u.email === 'imp.one@test.local')?._id));

    const mails = vi.mocked(sendMail).mock.calls.map((c) => c[0]);
    expect(mails).toHaveLength(2);
    expect(mails.map((m) => m.to).sort()).toEqual(['imp.one@test.local', 'imp.two@test.local']);
    for (const m of mails) expect(m.html).toMatch(/\/accept-invite\?token=[a-f0-9]{64}/);
  });

  it('an existing e-mail is updated, a bad row is an error, and neither sends a mail', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [
          { firstName: 'Renamed', lastName: 'Person', email: emp.user.email, joiningDate: '2024-01-15' },
          { firstName: 'No', lastName: 'Email', joiningDate: '2024-01-15' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.rows.map((r: { status: string }) => r.status)).toEqual(['updated', 'error']);
    expect(res.body.data.failed).toHaveLength(1);
    expect((await employeeNow(emp)).firstName).toBe('Renamed');
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });

  it('writes an audit entry per created and per updated row, and returns every count', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [
          { firstName: 'Audit', lastName: 'New', email: 'audit.new@test.local', joiningDate: '2024-01-15' },
          { firstName: 'Renamed', lastName: 'Person', email: emp.user.email, joiningDate: '2024-01-15' },
          { firstName: 'No', lastName: 'Email', joiningDate: '2024-01-15' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ created: 1, updated: 1, skipped: 0, errors: 1 });
    const created = await Employee.findOne({ email: 'audit.new@test.local' }).lean();
    await vi.waitFor(async () => expect(await AuditLog.countDocuments({ entity: 'Employee' })).toBe(2));
    const logs = await AuditLog.find({ entity: 'Employee' }).lean();
    expect(logs.find((l) => l.entityId === String(created!._id))?.action).toBe('create');
    expect(logs.find((l) => l.entityId === String(emp.employee._id))?.action).toBe('update');
    for (const log of logs) {
      expect(log.metadata).toMatchObject({ source: 'import' });
      expect(String(log.userId)).toBe(String(hr.user._id));
    }
  });

  it('an exit status goes through the exit path: past exitDate applies (login off, HR told), future schedules', async () => {
    const other = await actor('employee', { confirmationDate: new Date('2025-01-01') });
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [
          { firstName: 'Gone', lastName: 'Now', email: emp.user.email, joiningDate: '2024-01-15', status: 'resigned', exitDate: '2026-10-12' },
          { firstName: 'Going', lastName: 'Soon', email: other.user.email, joiningDate: '2024-01-15', status: 'terminated', exitDate: '2026-10-30' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.updated).toBe(2);
    const gone = await employeeNow(emp);
    expect(gone.status).toBe('resigned');
    expect(gone.exitStatus).toBe('resigned');
    expect(gone.exitDate?.toISOString().slice(0, 10)).toBe('2026-10-12');
    expect((await userNow(emp)).status).toBe('inactive');
    expect(await Notification.countDocuments({ userId: hr.user._id, type: 'system_alert' })).toBe(1);

    const going = await employeeNow(other);
    expect(going.status).toBe('active');
    expect(going.exitStatus).toBe('terminated');
    expect(going.exitDate?.toISOString().slice(0, 10)).toBe('2026-10-30');
    expect((await userNow(other)).status).toBe('active');
  });

  it('an exit status without an exitDate is never set directly: the status is left alone and the row says why', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [
          { firstName: 'Still', lastName: 'Here', email: emp.user.email, joiningDate: '2024-01-15', status: 'terminated' },
          { firstName: 'New', lastName: 'Leaver', email: 'new.leaver@test.local', joiningDate: '2024-01-15', status: 'inactive' },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.data.rows.map((r: { status: string }) => r.status)).toEqual(['updated', 'created']);
    for (const row of res.body.data.rows) expect(row.message).toMatch(/exitDate/);
    const still = await employeeNow(emp);
    expect(still.status).toBe('active');
    expect(still.firstName).toBe('Still');
    expect(still.exitStatus).toBeFalsy();
    expect((await userNow(emp)).status).toBe('active');
    expect((await Employee.findOne({ email: 'new.leaver@test.local' }).lean())?.status).toBe('active');
  });

  it('an Employee ID already used by someone else is a row error, and no login is left behind', async () => {
    const res = await request(app)
      .post('/api/v1/employees/import')
      .set(auth(hr.token))
      .send({
        employees: [{ firstName: 'Clash', lastName: 'Id', email: 'clash@test.local', joiningDate: '2024-01-15', employeeId: emp.employee.employeeId }],
      });

    expect(res.body.data.rows[0].status).toBe('error');
    expect(await User.countDocuments({ email: 'clash@test.local' }).setOptions({ withDeleted: true })).toBe(0);
    expect(vi.mocked(sendMail)).not.toHaveBeenCalled();
  });
});
