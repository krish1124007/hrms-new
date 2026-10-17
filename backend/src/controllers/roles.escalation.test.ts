/**
 * Privilege-escalation guards on role and user administration: only the
 * catalogued permissions may be granted, `*` only by a `*` holder, and a
 * caller without `*` can never hand out (directly or through a role) a
 * permission they do not hold themselves.
 */
import request from 'supertest';
import type { Express } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp } from '../app.js';
import { createRole, createUser } from '../test/factories.js';
import { Role } from '../models/role.model.js';
import { User } from '../models/user.model.js';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

let app: Express;

/** The default hr_manager set has no roles.* / users.*; grant them as custom permissions. */
async function delegatedHrManager(): Promise<{ token: string }> {
  const { user, token } = await createUser({ roleSlug: 'hr_manager' });
  await User.updateOne(
    { _id: user._id },
    { $set: { customPermissions: ['roles.create', 'roles.update', 'users.update', 'users.create'] } },
  );
  return { token };
}

async function adminToken(): Promise<string> {
  return (await createUser({ roleSlug: 'admin' })).token;
}

beforeEach(() => {
  app = createApp();
});

describe('POST /roles', () => {
  it('403 when a non-admin tries to create a role holding the wildcard', async () => {
    const { token } = await delegatedHrManager();
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(token))
      .send({ name: 'Backdoor', permissions: ['*'] });
    expect(res.status).toBe(403);
    expect(await Role.countDocuments({ slug: 'backdoor' })).toBe(0);
  });

  it('400 VALIDATION_ERROR naming every permission outside the catalogue', async () => {
    const { token } = await delegatedHrManager();
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(token))
      .send({ name: 'Typo role', permissions: ['payroll.view', 'not.a.permission', 'also.bogus'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain('not.a.permission');
    expect(JSON.stringify(res.body)).toContain('also.bogus');
    expect(await Role.countDocuments({ slug: 'typo-role' })).toBe(0);
  });

  it('rejects the wildcard-looking and inert names that used to be accepted', async () => {
    const { token } = await delegatedHrManager();
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(token))
      .send({ name: 'Inert', permissions: ['expense-claims.view', 'documents.view'] });
    expect(res.status).toBe(400);
  });

  it('403 naming the permissions the caller lacks when granting more than they hold', async () => {
    const { token } = await delegatedHrManager();
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(token))
      .send({ name: 'Overreach', permissions: ['payroll.view', 'users.delete'] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('users.delete');
    expect(JSON.stringify(res.body)).not.toContain('payroll.view');
  });

  it('201 when the caller grants only catalogued permissions they hold', async () => {
    const { token } = await delegatedHrManager();
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(token))
      .send({ name: 'Payroll viewer', permissions: ['payroll.view', 'employees.view'] });
    expect(res.status).toBe(201);
    expect(res.body.data.permissions).toEqual(['payroll.view', 'employees.view']);
  });

  it('201 for an admin creating a wildcard role', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(await adminToken()))
      .send({ name: 'Second admin', permissions: ['*'] });
    expect(res.status).toBe(201);
    expect(res.body.data.permissions).toEqual(['*']);
  });
});

describe('PATCH /roles/:id', () => {
  it('400 for unknown names, 403 for adding the wildcard or a permission the caller lacks', async () => {
    const { token } = await delegatedHrManager();
    const role = await Role.create({ name: 'Custom', slug: 'custom', permissions: ['payroll.view'] });
    const patch = (permissions: string[]) =>
      request(app).patch(`/api/v1/roles/${role._id}`).set(auth(token)).send({ permissions });

    expect((await patch(['payroll.view', 'not.a.permission'])).status).toBe(400);
    expect((await patch(['payroll.view', '*'])).status).toBe(403);
    expect((await patch(['payroll.view', 'users.delete'])).status).toBe(403);

    const unchanged = await Role.findById(role._id).orFail().lean().exec();
    expect(unchanged.permissions).toEqual(['payroll.view']);

    const ok = await patch(['payroll.view', 'employees.view']);
    expect(ok.status).toBe(200);
    expect(ok.body.data.permissions).toEqual(['payroll.view', 'employees.view']);
  });

  it('lets a non-admin keep a permission they lack that the role already holds', async () => {
    const { token } = await delegatedHrManager();
    const role = await Role.create({
      name: 'Has delete',
      slug: 'has-delete',
      permissions: ['users.delete'],
    });
    const res = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ name: 'Has delete (renamed)', permissions: ['users.delete', 'payroll.view'] });
    expect(res.status).toBe(200);
  });

  it('200 for an admin adding the wildcard', async () => {
    const role = await Role.create({ name: 'Custom', slug: 'custom', permissions: [] });
    const res = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(await adminToken()))
      .send({ permissions: ['*'] });
    expect(res.status).toBe(200);
  });
});

describe('PATCH /users/:id', () => {
  it('403 when granting a custom permission the caller lacks, naming it', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ customPermissions: ['users.delete'] });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain('users.delete');

    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(after.customPermissions).toEqual([]);
  });

  it('403 for the wildcard as a custom permission; 400 for an unknown name', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'employee' });
    const patch = (customPermissions: string[]) =>
      request(app)
        .patch(`/api/v1/users/${target.user._id}`)
        .set(auth(token))
        .send({ customPermissions });

    expect((await patch(['*'])).status).toBe(403);
    const unknown = await patch(['payroll.view', 'not.a.permission']);
    expect(unknown.status).toBe(400);
    expect(JSON.stringify(unknown.body)).toContain('not.a.permission');
  });

  it('200 when granting only permissions the caller holds', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ customPermissions: ['employees.view', 'payroll.process'] });
    expect(res.status).toBe(200);
    expect(res.body.data.customPermissions).toEqual(['employees.view', 'payroll.process']);
  });

  it('403 when assigning a role that holds the wildcard, even to oneself', async () => {
    const { token } = await delegatedHrManager();
    const admin = await createRole('admin');
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: String(admin._id) });
    expect(res.status).toBe(403);

    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(String(after.role)).not.toBe(String(admin._id));
  });

  it('403 when assigning a role with permissions the caller lacks, 200 for one they hold', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'employee' });
    const beyond = await Role.create({
      name: 'Beyond',
      slug: 'beyond',
      permissions: ['employees.view', 'users.delete'],
    });
    const denied = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: String(beyond._id) });
    expect(denied.status).toBe(403);
    expect(JSON.stringify(denied.body)).toContain('users.delete');

    const hrExecutive = await createRole('hr_executive');
    const allowed = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: String(hrExecutive._id) });
    expect(allowed.status).toBe(200);
  });

  it('404 for a role id that does not exist', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: '0123456789abcdef01234567' });
    expect(res.status).toBe(404);
  });

  it('does not block an unrelated edit of a user who already holds more than the caller', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'admin' });
    const admin = await createRole('admin');
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ firstName: 'Renamed', roleId: String(admin._id) });
    expect(res.status).toBe(200);
    expect(res.body.data.firstName).toBe('Renamed');
  });

  it('200 for an admin granting the wildcard and assigning the admin role', async () => {
    const token = await adminToken();
    const admin = await createRole('admin');
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: String(admin._id), customPermissions: ['*'] });
    expect(res.status).toBe(200);
  });
});

describe('other paths that assign a role', () => {
  it('POST /users: 403 when inviting someone into the admin role without holding *', async () => {
    const { token } = await delegatedHrManager();
    const admin = await createRole('admin');
    const res = await request(app)
      .post('/api/v1/users')
      .set(auth(token))
      .send({
        email: 'new.admin@test.local',
        firstName: 'New',
        lastName: 'Admin',
        roleId: String(admin._id),
      });
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ email: 'new.admin@test.local' })).toBe(0);
  });

  it('POST /employees: 403 when creating a login for the admin role without holding *', async () => {
    const hrExecutive = await createUser({ roleSlug: 'hr_executive' });
    const admin = await createRole('admin');
    const res = await request(app)
      .post('/api/v1/employees')
      .set(auth(hrExecutive.token))
      .send({
        firstName: 'Sneaky',
        lastName: 'Admin',
        email: 'sneaky.admin@test.local',
        joiningDate: '2026-01-05',
        createUserAccount: true,
        roleId: String(admin._id),
        password: 'Sup3r!Secret#Pass',
      });
    expect(res.status).toBe(403);
    expect(await User.countDocuments({ email: 'sneaky.admin@test.local' })).toBe(0);
  });
});
