/**
 * Field work cannot be planned or assigned for an employee whose login lacks
 * `field.view` (role + custom permissions, as `requirePermission` reads them):
 * 400 EMPLOYEE_NO_FIELD_ACCESS "Give <name> the Field Employee role first" on
 * POST /field/visits/plan, /field/visit-schedules and /field/tasks (and when a
 * schedule or task is moved to such an employee). GET /field/team/access lists
 * them for the pickers.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createRole, createUser, createEmployeeFor } from '../test/factories.js';
import { auth, fieldManager, pinnedSite, viewer, ymd, type FieldActor } from '../test/field-fixtures.js';
import { User } from '../models/user.model.js';
import { Employee } from '../models/employee.model.js';
import { FieldTask } from '../models/field-task.model.js';
import { VisitSchedule } from '../models/visit-schedule.model.js';

let app: Express;
let M: FieldActor;

beforeEach(async () => {
  app = createApp();
  M = await fieldManager();
});

/** A plain `employee`-role login with an employee record — what every user had before roles could be given. */
async function plainEmployee() {
  const names = { firstName: 'Ravi', lastName: 'Kumar' };
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: names });
  const employee = await createEmployeeFor(user, names);
  return { user, token, employee };
}

const loginless = (email: string) =>
  Employee.create({ firstName: 'Nolan', lastName: 'Gin', email, joiningDate: new Date('2024-01-15') });

const plan = (who: { token: string }, employeeId: string, siteId: string) =>
  request(app)
    .post('/api/v1/field/visits/plan')
    .set(auth(who.token))
    .send({ employeeId, siteId, plannedDate: ymd(1), purpose: 'Audit' });

describe('field work for an employee without Field Visits access', () => {
  it('planning a visit: 400 EMPLOYEE_NO_FIELD_ACCESS naming them; 201 once they have the Field Employee role', async () => {
    const ravi = await plainEmployee();
    const site = await pinnedSite([ravi.employee]);
    const refused = await plan(M, String(ravi.employee._id), String(site._id));
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
    expect(refused.body.error.message).toBe('Give Ravi Kumar the Field Employee role first');
    expect(refused.body.error.details).toMatchObject({ employeeId: String(ravi.employee._id), reason: 'no_permission' });

    await User.updateOne({ _id: ravi.user._id }, { $set: { role: (await createRole('field_employee'))._id } });
    expect((await plan(M, String(ravi.employee._id), String(site._id))).status).toBe(201);
  });

  it('field.view as a custom permission counts as access', async () => {
    const ravi = await plainEmployee();
    await User.updateOne({ _id: ravi.user._id }, { $set: { customPermissions: ['field.view'] } });
    const site = await pinnedSite([ravi.employee]);
    expect((await plan(M, String(ravi.employee._id), String(site._id))).status).toBe(201);
  });

  it('an employee with no login at all: 400 EMPLOYEE_NO_FIELD_ACCESS saying so', async () => {
    const nolan = await loginless('nolan@test.local');
    const site = await pinnedSite([nolan]);
    const res = await plan(M, String(nolan._id), String(site._id));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
    expect(res.body.error.details).toMatchObject({ reason: 'no_login' });
    expect(res.body.error.message).toContain('Nolan Gin has no login');
  });

  it('the scope check still comes first: a rep planning for a non-report gets 403, not 400', async () => {
    const rep = await viewer();
    const ravi = await plainEmployee();
    const site = await pinnedSite([rep.employee, ravi.employee]);
    expect((await plan(rep, String(ravi.employee._id), String(site._id))).status).toBe(403);
  });

  it('a recurring visit: refused on create and when moved to them', async () => {
    const ravi = await plainEmployee();
    const rep = await viewer();
    const site = await pinnedSite([ravi.employee, rep.employee]);
    const rule = { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], startDate: ymd(0) };
    const refused = await request(app)
      .post('/api/v1/field/visit-schedules')
      .set(auth(M.token))
      .send({ siteId: String(site._id), employeeId: String(ravi.employee._id), purpose: 'Audit', rule });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
    expect(await VisitSchedule.countDocuments({})).toBe(0);

    const ok = await request(app)
      .post('/api/v1/field/visit-schedules')
      .set(auth(M.token))
      .send({ siteId: String(site._id), employeeId: String(rep.employee._id), purpose: 'Audit', rule });
    expect(ok.status).toBe(201);
    const moved = await request(app)
      .patch(`/api/v1/field/visit-schedules/${ok.body.data._id}`)
      .set(auth(M.token))
      .send({ employeeId: String(ravi.employee._id) });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
  });

  it('a task: refused on create and when reassigned to them', async () => {
    const ravi = await plainEmployee();
    const rep = await viewer();
    const refused = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Inspect', assignedTo: String(ravi.employee._id) });
    expect(refused.status).toBe(400);
    expect(refused.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
    expect(await FieldTask.countDocuments({})).toBe(0);

    const ok = await request(app)
      .post('/api/v1/field/tasks')
      .set(auth(M.token))
      .send({ title: 'Inspect', assignedTo: String(rep.employee._id) });
    expect(ok.status).toBe(201);
    const moved = await request(app)
      .patch(`/api/v1/field/tasks/${ok.body.data._id}`)
      .set(auth(M.token))
      .send({ assignedTo: String(ravi.employee._id) });
    expect(moved.status).toBe(400);
    expect(moved.body.error.code).toBe('EMPLOYEE_NO_FIELD_ACCESS');
  });

  it('GET /field/team/access lists who in scope lacks access, and why', async () => {
    const ravi = await plainEmployee();
    const rep = await viewer();
    const nolan = await loginless('nolan2@test.local');
    const res = await request(app).get('/api/v1/field/team/access').set(auth(M.token));
    expect(res.status).toBe(200);
    expect(res.body.data.noAccess).toMatchObject({
      [String(ravi.employee._id)]: 'no_permission',
      [String(nolan._id)]: 'no_login',
    });
    expect(res.body.data.noAccess[String(rep.employee._id)]).toBeUndefined();
    expect(res.body.data.noAccess[String(M.employee._id)]).toBeUndefined();

    // A team lead sees only themselves and their direct reports.
    const lead = await viewer();
    await Employee.updateOne({ _id: ravi.employee._id }, { $set: { reportingManager: lead.employee._id } });
    const scoped = await request(app).get('/api/v1/field/team/access').set(auth(lead.token));
    expect(Object.keys(scoped.body.data.noAccess)).toEqual([String(ravi.employee._id)]);
  });

  it('GET /field/team/access needs field.view', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    expect((await request(app).get('/api/v1/field/team/access').set(auth(token))).status).toBe(403);
  });
});
