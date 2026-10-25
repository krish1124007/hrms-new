/**
 * Giving a login a role (PATCH /users/:id { roleId }), the role picker's list
 * (GET /roles/assignable) and the role a new employee's login gets. The Field
 * Visits guard-rail that relies on it is in field.access.test.ts.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createRole, createUser, createEmployeeFor, type RoleSlug } from '../test/factories.js';
import { auth } from '../test/field-fixtures.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { AuditLog } from '../models/audit-log.model.js';

let app: Express;

beforeEach(() => {
  app = createApp();
});

/** A plain `employee`-role login with an employee record — what every user had before this fix. */
async function plainEmployee(names: { firstName: string; lastName: string } = { firstName: 'Ravi', lastName: 'Kumar' }) {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne({ _id: user._id }, { $set: names });
  const employee = await createEmployeeFor(user, names);
  return { user, token, employee, userId: String(user._id) };
}

const roleId = async (slug: RoleSlug) => String((await createRole(slug))._id);

describe('PATCH /users/:id { roleId }', () => {
  it('an admin gives a plain employee the Field Employee role; it applies to their next request with the same token', async () => {
    const admin = await createUser({ roleSlug: 'admin' });
    const ravi = await plainEmployee();
    const fieldEmployee = await roleId('field_employee');

    // Before: the employee role has no field.view.
    expect((await request(app).get('/api/v1/field/my-day').set(auth(ravi.token))).status).toBe(403);

    const res = await request(app)
      .patch(`/api/v1/users/${ravi.userId}`)
      .set(auth(admin.token))
      .send({ roleId: fieldEmployee });
    expect(res.status).toBe(200);
    expect(res.body.data.role).toMatchObject({ slug: 'field_employee' });

    // After: permissions are read from the database on every request — no new sign-in.
    expect((await request(app).get('/api/v1/field/my-day').set(auth(ravi.token))).status).toBe(200);

    // The audit entry names the change.
    const entry = await AuditLog.findOne({ entity: 'User', entityId: ravi.userId, 'metadata.event': 'role.change' }).lean();
    expect(entry?.metadata).toMatchObject({ fromRole: 'employee', toRole: 'field_employee' });
  });

  it('403 SELF_ROLE_CHANGE when anyone — an admin included — changes their own role', async () => {
    const admin = await createUser({ roleSlug: 'admin' });
    const employeeRole = await roleId('employee');
    const res = await request(app)
      .patch(`/api/v1/users/${admin.user._id}`)
      .set(auth(admin.token))
      .send({ roleId: employeeRole });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_ROLE_CHANGE');
    const after = await User.findById(admin.user._id).populate<{ role: { slug: string } }>('role').lean();
    expect(after?.role.slug).toBe('admin');
  });

  it('re-sending your own current role is not a change and is allowed', async () => {
    const admin = await createUser({ roleSlug: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${admin.user._id}`)
      .set(auth(admin.token))
      .send({ firstName: 'Owner', roleId: String(admin.user.role) });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Owner');
  });

  it('400 for a roleId that is not an id; 404 for one that names no role', async () => {
    const admin = await createUser({ roleSlug: 'admin' });
    const ravi = await plainEmployee();
    const bad = await request(app).patch(`/api/v1/users/${ravi.userId}`).set(auth(admin.token)).send({ roleId: 'field_employee' });
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .patch(`/api/v1/users/${ravi.userId}`)
      .set(auth(admin.token))
      .send({ roleId: '0123456789abcdef01234567' });
    expect(missing.status).toBe(404);
  });

  it('a non-admin user administrator cannot grant the admin role, but can grant Field Employee', async () => {
    const { user, token } = await createUser({ roleSlug: 'hr_manager' });
    await User.updateOne({ _id: user._id }, { $set: { customPermissions: ['users.update'] } });
    const ravi = await plainEmployee();

    const toAdmin = await request(app).patch(`/api/v1/users/${ravi.userId}`).set(auth(token)).send({ roleId: await roleId('admin') });
    expect(toAdmin.status).toBe(403);
    expect(toAdmin.body.error.details.missingPermissions).toContain('*');

    const toField = await request(app)
      .patch(`/api/v1/users/${ravi.userId}`)
      .set(auth(token))
      .send({ roleId: await roleId('field_employee') });
    expect(toField.status).toBe(200);
  });

  it('403 without users.update — the default HR Manager role cannot change roles', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const ravi = await plainEmployee();
    const res = await request(app)
      .patch(`/api/v1/users/${ravi.userId}`)
      .set(auth(hr.token))
      .send({ roleId: await roleId('field_employee') });
    expect(res.status).toBe(403);
  });
});

describe('GET /roles/assignable', () => {
  it('lists every role with descriptions and flags, without permission lists, for an employees.create holder', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const slugs: RoleSlug[] = ['admin', 'employee', 'field_employee', 'field_manager'];
    await Promise.all(slugs.map((slug) => createRole(slug)));
    const res = await request(app).get('/api/v1/roles/assignable').set(auth(hr.token));
    expect(res.status).toBe(200);
    const bySlug = Object.fromEntries((res.body.data as Array<{ slug: string }>).map((r) => [r.slug, r]));
    expect(bySlug.field_employee).toMatchObject({
      name: 'Field Employee',
      assignable: true,
      fieldAccess: true,
      fieldManage: false,
      privileged: false,
    });
    expect(bySlug.field_employee.description).toMatch(/site/i);
    expect(bySlug.field_manager).toMatchObject({ assignable: true, fieldAccess: true });
    expect(bySlug.employee).toMatchObject({ assignable: true, fieldAccess: false });
    expect(bySlug.admin).toMatchObject({ assignable: false, privileged: true, fieldAccess: true, fieldManage: true });
    expect(bySlug.admin.permissions).toBeUndefined();
  });

  it('every role is assignable for an admin', async () => {
    const admin = await createUser({ roleSlug: 'admin' });
    await createRole('field_employee');
    const res = await request(app).get('/api/v1/roles/assignable').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect((res.body.data as Array<{ assignable: boolean }>).every((r) => r.assignable)).toBe(true);
  });

  it('403 for a plain employee', async () => {
    const { token } = await createUser({ roleSlug: 'employee' });
    expect((await request(app).get('/api/v1/roles/assignable').set(auth(token))).status).toBe(403);
  });
});

describe('the role a new employee login gets', () => {
  const body = (extra: Record<string, unknown>) => ({
    firstName: 'Sita',
    lastName: 'Rao',
    email: `sita.${Math.random().toString(36).slice(2, 8)}@test.local`,
    joiningDate: '2026-01-05',
    createUserAccount: true,
    password: 'Sup3r!Secret#Pass',
    ...extra,
  });
  const loginRoleOf = async (email: string) =>
    (await User.findOne({ email }).populate<{ role: { slug: string } }>('role').lean())?.role.slug;

  it('field staff without an explicit role get Field Employee; others get Employee', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    await createRole('employee');
    await createRole('field_employee');
    const field = body({ isFieldStaff: true });
    expect((await request(app).post('/api/v1/employees').set(auth(hr.token)).send(field)).status).toBe(201);
    expect(await loginRoleOf(field.email)).toBe('field_employee');

    const office = body({ isFieldStaff: false });
    expect((await request(app).post('/api/v1/employees').set(auth(hr.token)).send(office)).status).toBe(201);
    expect(await loginRoleOf(office.email)).toBe('employee');
  });

  it('an explicit roleId is honoured (and wins over the field staff default)', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const fieldManagerRole = await roleId('field_manager');
    const input = body({ isFieldStaff: true, roleId: fieldManagerRole });
    expect((await request(app).post('/api/v1/employees').set(auth(hr.token)).send(input)).status).toBe(201);
    expect(await loginRoleOf(input.email)).toBe('field_manager');
  });

  it('GET /employees/:id names the login role and whether it opens Field Visits', async () => {
    const hr = await createUser({ roleSlug: 'hr_manager' });
    const ravi = await plainEmployee();
    const res = await request(app).get(`/api/v1/employees/${ravi.employee._id}`).set(auth(hr.token));
    expect(res.status).toBe(200);
    expect(res.body.data.userId).toMatchObject({ _id: ravi.userId, status: 'active', role: { name: 'Employee', slug: 'employee' } });
    expect(res.body.data.userId.role.permissions).toBeUndefined();
    expect(res.body.data.fieldAccess).toBe(false);

    await User.updateOne({ _id: ravi.user._id }, { $set: { role: (await createRole('field_employee'))._id } });
    const after = await request(app).get(`/api/v1/employees/${ravi.employee._id}`).set(auth(hr.token));
    expect(after.body.data.fieldAccess).toBe(true);
  });
});

describe('role seeding contract the UI relies on', () => {
  it('Field Employee and Field Manager exist with field.view', async () => {
    const fe = await createRole('field_employee');
    const fm = await createRole('field_manager');
    expect(fe.permissions).toContain('field.view');
    expect(fm.permissions).toContain('field.view');
    expect(await Role.countDocuments({ slug: { $in: ['field_employee', 'field_manager'] } })).toBe(2);
  });
});
