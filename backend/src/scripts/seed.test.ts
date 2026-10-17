/**
 * The seed scripts all go through ensureSystemRoles(): it must be idempotent,
 * keep the built-in roles current, and never touch a user document.
 */
import { describe, it, expect } from 'vitest';
import { ensureSystemRoles } from '../lib/seed-roles.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';
import { User } from '../models/user.model.js';
import { createUser } from '../test/factories.js';

describe('ensureSystemRoles', () => {
  it('is idempotent: five roles after one run, five after two, admin keeps the wildcard', async () => {
    const first = await ensureSystemRoles();
    expect(first).toEqual({ created: 5, refreshed: 0 });
    expect(await Role.countDocuments()).toBe(5);

    const second = await ensureSystemRoles();
    expect(second).toEqual({ created: 0, refreshed: 0 });
    expect(await Role.countDocuments()).toBe(5);

    const admin = await Role.findOne({ slug: 'admin' }).orFail().lean().exec();
    expect(admin.permissions).toEqual(['*']);
    expect(admin.isSystem).toBe(true);
  });

  it('refreshes a stale system role to the DEFAULT_ROLES contract', async () => {
    await ensureSystemRoles();
    await Role.updateOne({ slug: 'manager' }, { $set: { permissions: ['employees.view'] } });

    const result = await ensureSystemRoles();
    expect(result).toEqual({ created: 0, refreshed: 1 });

    const manager = await Role.findOne({ slug: 'manager' }).orFail().lean().exec();
    const expected = DEFAULT_ROLES.find((role) => role.slug === 'manager')!.permissions;
    expect(manager.permissions).toEqual(expected);
  });

  it('leaves an existing user document byte-identical', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const snapshot = async (): Promise<string> =>
      JSON.stringify(await User.findById(user._id).select('+password').lean().exec());

    const before = await snapshot();
    await ensureSystemRoles();
    await ensureSystemRoles();
    const after = await snapshot();

    expect(after).toBe(before);
  });
});
