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
async function delegatedHrManager(): Promise<{ token: string; userId: string }> {
  const { user, token } = await createUser({ roleSlug: 'hr_manager' });
  await User.updateOne(
    { _id: user._id },
    { $set: { customPermissions: ['roles.create', 'roles.update', 'users.update', 'users.create'] } },
  );
  return { token, userId: String(user._id) };
}

/** An ordinary employee who has been delegated role editing and deletion (and nothing else). */
async function lesserRoleAdmin(): Promise<{ token: string }> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne(
    { _id: user._id },
    { $set: { customPermissions: ['roles.update', 'roles.delete'] } },
  );
  return { token };
}

/** An ordinary employee who has been delegated user administration (and nothing else). */
async function lesserUserAdmin(): Promise<{ token: string }> {
  const { user, token } = await createUser({ roleSlug: 'employee' });
  await User.updateOne(
    { _id: user._id },
    { $set: { customPermissions: ['users.update', 'users.delete'] } },
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

  it('400 for names the old catalogue offered although no route checks them', async () => {
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

  it('403 when a non-admin edits a role that holds a permission they lack, even just a rename', async () => {
    const { token } = await delegatedHrManager();
    const role = await Role.create({
      name: 'Has delete',
      slug: 'has-delete',
      permissions: ['users.delete'],
    });
    const res = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ name: 'Has delete (renamed)' });
    expect(res.status).toBe(403);
    expect(res.body.error.details.missingPermissions).toEqual(['users.delete']);
    expect((await Role.findById(role._id).orFail().lean().exec()).name).toBe('Has delete');
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

  it('403 when assigning a role that holds the wildcard to another user', async () => {
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

  it('403 when assigning the admin role to oneself', async () => {
    const { token, userId } = await delegatedHrManager();
    const admin = await createRole('admin');
    const res = await request(app)
      .patch(`/api/v1/users/${userId}`)
      .set(auth(token))
      .send({ roleId: String(admin._id) });
    expect(res.status).toBe(403);

    const after = await User.findById(userId).orFail().lean().exec();
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

  it('403 for any edit of a user who holds more than the caller, even a name change', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'admin' });
    const admin = await createRole('admin');
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ firstName: 'Renamed', roleId: String(admin._id) });
    expect(res.status).toBe(403);
    expect(res.body.error.details.missingPermissions).toContain('*');

    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(after.firstName).not.toBe('Renamed');
  });

  it('403 when a lesser admin tries to demote an admin to the employee role; the admin is unchanged', async () => {
    const { token } = await lesserUserAdmin();
    const employeeRole = await createRole('employee');
    const adminRole = await createRole('admin');
    const target = await createUser({ roleSlug: 'admin' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ roleId: String(employeeRole._id), customPermissions: [] });
    expect(res.status).toBe(403);

    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(String(after.role)).toBe(String(adminRole._id));
  });

  it('200 for the same caller editing a plain employee', async () => {
    const { token } = await lesserUserAdmin();
    const target = await createUser({ roleSlug: 'employee' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ firstName: 'Renamed' });
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

describe('retired permission names already stored on a record', () => {
  const RETIRED_ROLE = ['departments.manage', 'employees.view'];

  async function legacyRole(): Promise<{ id: string }> {
    // Written straight to Mongo: this is what production holds from before the catalogue was fixed.
    const role = await Role.create({ name: 'Legacy', slug: 'legacy', permissions: RETIRED_ROLE });
    return { id: String(role._id) };
  }

  it('PATCH /roles/:id: renaming a role that holds a retired name succeeds and keeps the list', async () => {
    const token = await adminToken();
    const { id } = await legacyRole();
    const res = await request(app)
      .patch(`/api/v1/roles/${id}`)
      .set(auth(token))
      .send({ name: 'Legacy renamed', permissions: RETIRED_ROLE });
    expect(res.status).toBe(200);

    const stored = await Role.findById(id).orFail().lean().exec();
    expect(stored.name).toBe('Legacy renamed');
    expect(stored.permissions).toEqual(RETIRED_ROLE);
  });

  it('PATCH /roles/:id: a rename without a permission list also succeeds', async () => {
    const token = await adminToken();
    const { id } = await legacyRole();
    const res = await request(app)
      .patch(`/api/v1/roles/${id}`)
      .set(auth(token))
      .send({ name: 'Legacy renamed' });
    expect(res.status).toBe(200);
    expect((await Role.findById(id).orFail().lean().exec()).permissions).toEqual(RETIRED_ROLE);
  });

  it('PATCH /roles/:id: dropping a retired name is allowed', async () => {
    const token = await adminToken();
    const { id } = await legacyRole();
    const res = await request(app)
      .patch(`/api/v1/roles/${id}`)
      .set(auth(token))
      .send({ permissions: ['employees.view'] });
    expect(res.status).toBe(200);
    expect((await Role.findById(id).orFail().lean().exec()).permissions).toEqual(['employees.view']);
  });

  it('PATCH /roles/:id: a newly added unknown name is still 400, and nothing is saved', async () => {
    const token = await adminToken();
    const { id } = await legacyRole();
    const res = await request(app)
      .patch(`/api/v1/roles/${id}`)
      .set(auth(token))
      .send({ permissions: [...RETIRED_ROLE, 'not.real'] });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(JSON.stringify(res.body)).toContain('not.real');
    expect(JSON.stringify(res.body)).not.toContain('departments.manage');
    expect((await Role.findById(id).orFail().lean().exec()).permissions).toEqual(RETIRED_ROLE);
  });

  it('PATCH /roles/:id: re-adding a retired name that is not on the role is rejected', async () => {
    const token = await adminToken();
    const { id } = await legacyRole();
    const res = await request(app)
      .patch(`/api/v1/roles/${id}`)
      .set(auth(token))
      .send({ permissions: [...RETIRED_ROLE, 'documents.view'] });
    expect(res.status).toBe(400);
  });

  it('POST /roles stays strict: a retired name cannot be put on a new role', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set(auth(await adminToken()))
      .send({ name: 'Fresh', permissions: ['departments.manage'] });
    expect(res.status).toBe(400);
  });

  it('PATCH /users/:id: re-sending stored custom permissions that include a retired name succeeds', async () => {
    const token = await adminToken();
    const target = await createUser({ roleSlug: 'employee' });
    const stored = ['expense-claims.view', 'payroll.view'];
    await User.updateOne({ _id: target.user._id }, { $set: { customPermissions: stored } });

    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ firstName: 'Renamed', customPermissions: stored });
    expect(res.status).toBe(200);

    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(after.firstName).toBe('Renamed');
    expect(after.customPermissions).toEqual(stored);
  });

  it('PATCH /users/:id: a newly added unknown custom permission is still 400', async () => {
    const token = await adminToken();
    const target = await createUser({ roleSlug: 'employee' });
    const stored = ['expense-claims.view'];
    await User.updateOne({ _id: target.user._id }, { $set: { customPermissions: stored } });

    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}`)
      .set(auth(token))
      .send({ customPermissions: [...stored, 'not.real'] });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain('not.real');
    const after = await User.findById(target.user._id).orFail().lean().exec();
    expect(after.customPermissions).toEqual(stored);
  });
});

describe('a user who holds more than the caller is protected from them', () => {
  const STRONG_PASSWORD = 'Rotat3d!Secret#99';

  it('403 (naming what is missing) on password reset, status change and delete of an admin', async () => {
    const { token } = await lesserUserAdmin();
    const admin = await createUser({ roleSlug: 'admin' });
    const before = await User.findById(admin.user._id).select('+password').orFail().lean().exec();

    const reset = await request(app)
      .patch(`/api/v1/users/${admin.user._id}/password`)
      .set(auth(token))
      .send({ password: STRONG_PASSWORD });
    expect(reset.status).toBe(403);
    expect(reset.body.error.details.missingPermissions).toContain('*');

    const status = await request(app)
      .patch(`/api/v1/users/${admin.user._id}/status`)
      .set(auth(token))
      .send({ status: 'inactive' });
    expect(status.status).toBe(403);

    const del = await request(app).delete(`/api/v1/users/${admin.user._id}`).set(auth(token));
    expect(del.status).toBe(403);

    const after = await User.findById(admin.user._id).select('+password').orFail().lean().exec();
    expect(after.password).toBe(before.password);
    expect(after.status).toBe('active');
    expect(after.isDeleted).toBe(false);
    expect(after.sessionVersion).toBe(before.sessionVersion);
  });

  it('403 when the target holds a custom permission the caller lacks', async () => {
    const { token } = await lesserUserAdmin();
    const target = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: target.user._id }, { $set: { customPermissions: ['payroll.process'] } });

    const status = await request(app)
      .patch(`/api/v1/users/${target.user._id}/status`)
      .set(auth(token))
      .send({ status: 'inactive' });
    expect(status.status).toBe(403);
    expect(status.body.error.details.missingPermissions).toEqual(['payroll.process']);
  });

  it('200 on password reset, status change and delete of an ordinary employee', async () => {
    const { token } = await lesserUserAdmin();
    const target = await createUser({ roleSlug: 'employee' });

    const reset = await request(app)
      .patch(`/api/v1/users/${target.user._id}/password`)
      .set(auth(token))
      .send({ password: STRONG_PASSWORD });
    expect(reset.status).toBe(200);

    const status = await request(app)
      .patch(`/api/v1/users/${target.user._id}/status`)
      .set(auth(token))
      .send({ status: 'inactive' });
    expect(status.status).toBe(200);
    expect(status.body.data.status).toBe('inactive');

    const del = await request(app).delete(`/api/v1/users/${target.user._id}`).set(auth(token));
    expect(del.status).toBe(200);
  });

  it('200 for a caller who holds everything the target holds (hr_manager over an hr_executive)', async () => {
    const { token } = await delegatedHrManager();
    const target = await createUser({ roleSlug: 'hr_executive' });
    const res = await request(app)
      .patch(`/api/v1/users/${target.user._id}/status`)
      .set(auth(token))
      .send({ status: 'inactive' });
    expect(res.status).toBe(200);
  });

  it('404 (not 403) for a user that does not exist', async () => {
    const { token } = await lesserUserAdmin();
    const res = await request(app)
      .delete('/api/v1/users/0123456789abcdef01234567')
      .set(auth(token));
    expect(res.status).toBe(404);
  });

  it('a * caller can reset, deactivate and delete another admin', async () => {
    const token = await adminToken();
    const other = await createUser({ roleSlug: 'admin' });

    const reset = await request(app)
      .patch(`/api/v1/users/${other.user._id}/password`)
      .set(auth(token))
      .send({ password: STRONG_PASSWORD });
    expect(reset.status).toBe(200);
    const status = await request(app)
      .patch(`/api/v1/users/${other.user._id}/status`)
      .set(auth(token))
      .send({ status: 'inactive' });
    expect(status.status).toBe(200);
    const del = await request(app).delete(`/api/v1/users/${other.user._id}`).set(auth(token));
    expect(del.status).toBe(200);
  });
});

describe('a role that holds more than the caller is protected from them', () => {
  const customRole = (permissions: string[], slug = 'custom') =>
    Role.create({ name: slug, slug, permissions });

  it('403 (naming what is missing) on PATCH and DELETE of a role holding a permission the caller lacks', async () => {
    const { token } = await lesserRoleAdmin();
    const role = await customRole(['payroll.view', 'payroll.process']);

    const patch = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ permissions: ['payroll.view'] });
    expect(patch.status).toBe(403);
    expect(patch.body.error.details.missingPermissions).toEqual(['payroll.process']);

    const del = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(del.status).toBe(403);

    const stored = await Role.findById(role._id).orFail().lean().exec();
    expect(stored.permissions).toEqual(['payroll.view', 'payroll.process']);
  });

  it('403 on PATCH and DELETE of a custom role holding the wildcard', async () => {
    const { token } = await lesserRoleAdmin();
    const role = await customRole(['*']);
    const patch = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ permissions: [] });
    expect(patch.status).toBe(403);
    expect(patch.body.error.details.missingPermissions).toEqual(['*']);
    const del = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(del.status).toBe(403);
    expect((await Role.findById(role._id).orFail().lean().exec()).permissions).toEqual(['*']);
  });

  it('retired names a role still stores do not count against the caller', async () => {
    const { token } = await lesserRoleAdmin();
    const role = await customRole(['departments.manage', 'payroll.view']);
    const res = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ name: 'Renamed', permissions: ['departments.manage', 'payroll.view'] });
    expect(res.status).toBe(200);
  });

  it('200 on PATCH and DELETE of a role the caller fully holds that no user references', async () => {
    const { token } = await lesserRoleAdmin();
    const role = await customRole(['payroll.view', 'leaves.view']);
    const patch = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ permissions: ['payroll.view'] });
    expect(patch.status).toBe(200);
    const del = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(del.status).toBe(200);
    expect(await Role.countDocuments({ _id: role._id })).toBe(0);
  });

  it('409 ROLE_IN_USE while a user references the role; 200 once that user is reassigned', async () => {
    const { token } = await lesserRoleAdmin();
    const role = await customRole(['payroll.view']);
    const holder = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: holder.user._id }, { $set: { role: role._id } });

    const blocked = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('ROLE_IN_USE');
    expect(await Role.countDocuments({ _id: role._id })).toBe(1);

    const employeeRole = await createRole('employee');
    await User.updateOne({ _id: holder.user._id }, { $set: { role: employeeRole._id } });

    const deleted = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(deleted.status).toBe(200);
    expect(await Role.countDocuments({ _id: role._id })).toBe(0);
  });

  it('409 ROLE_IN_USE even when the only user referencing the role is soft-deleted, also for an admin', async () => {
    const role = await customRole(['payroll.view']);
    const holder = await createUser({ roleSlug: 'employee' });
    await User.updateOne({ _id: holder.user._id }, { $set: { role: role._id } });
    await User.updateOne({ _id: holder.user._id }, { $set: { isDeleted: true } });

    const res = await request(app)
      .delete(`/api/v1/roles/${role._id}`)
      .set(auth(await adminToken()));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_IN_USE');
  });

  it('an admin (*) can edit and delete a role holding any permission', async () => {
    const token = await adminToken();
    const role = await customRole(['payroll.process', '*']);
    const patch = await request(app)
      .patch(`/api/v1/roles/${role._id}`)
      .set(auth(token))
      .send({ permissions: ['payroll.process'] });
    expect(patch.status).toBe(200);
    const del = await request(app).delete(`/api/v1/roles/${role._id}`).set(auth(token));
    expect(del.status).toBe(200);
  });

  it('system roles stay protected: 403 for an admin deleting a system role', async () => {
    const token = await adminToken();
    const hr = await createRole('hr_manager');
    const res = await request(app).delete(`/api/v1/roles/${hr._id}`).set(auth(token));
    expect(res.status).toBe(403);
  });
});
