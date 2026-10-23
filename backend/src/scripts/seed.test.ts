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
  it('is idempotent: seven roles after one run, seven after two, admin keeps the wildcard', async () => {
    const first = await ensureSystemRoles();
    expect(first).toEqual({ created: 7, refreshed: 0, strippedRoles: 0, strippedUsers: 0 });
    expect(await Role.countDocuments()).toBe(7);

    const second = await ensureSystemRoles();
    expect(second).toEqual({ created: 0, refreshed: 0, strippedRoles: 0, strippedUsers: 0 });
    expect(await Role.countDocuments()).toBe(7);

    const admin = await Role.findOne({ slug: 'admin' }).orFail().lean().exec();
    expect(admin.permissions).toEqual(['*']);
    expect(admin.isSystem).toBe(true);
  });

  it('refreshes a stale system role to the DEFAULT_ROLES contract', async () => {
    await ensureSystemRoles();
    await Role.updateOne({ slug: 'manager' }, { $set: { permissions: ['employees.view'] } });

    const result = await ensureSystemRoles();
    expect(result).toEqual({ created: 0, refreshed: 1, strippedRoles: 0, strippedUsers: 0 });

    const manager = await Role.findOne({ slug: 'manager' }).orFail().lean().exec();
    const expected = DEFAULT_ROLES.find((role) => role.slug === 'manager')!.permissions;
    expect(manager.permissions).toEqual(expected);
  });

  it('gives an existing hr_executive / hr_manager role expenses.config on the next run', async () => {
    await ensureSystemRoles();
    await Role.updateMany(
      { slug: { $in: ['hr_executive', 'hr_manager'] } },
      { $pull: { permissions: 'expenses.config' } },
    );

    const result = await ensureSystemRoles();

    expect(result.refreshed).toBe(2);
    for (const slug of ['hr_executive', 'hr_manager']) {
      // eslint-disable-next-line no-await-in-loop
      const role = await Role.findOne({ slug }).orFail().lean().exec();
      expect({ slug, has: role.permissions.includes('expenses.config') }).toEqual({ slug, has: true });
    }
    const manager = await Role.findOne({ slug: 'manager' }).orFail().lean().exec();
    expect(manager.permissions).not.toContain('expenses.config');
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

  describe('retired permission names', () => {
    const snapshotSystemRoles = async (): Promise<string> =>
      JSON.stringify(await Role.find({ isSystem: true }).sort({ slug: 1 }).lean().exec());

    it('are stripped from custom roles and user customPermissions; everything else is left alone', async () => {
      await ensureSystemRoles();

      const legacy = await Role.create({
        name: 'Legacy',
        slug: 'legacy',
        permissions: ['departments.manage', 'employees.view', 'documents.view', '*'],
      });
      const clean = await Role.create({
        name: 'Clean',
        slug: 'clean',
        permissions: ['payroll.view'],
      });
      const holder = await createUser({ roleSlug: 'employee' });
      await User.updateOne(
        { _id: holder.user._id },
        { $set: { customPermissions: ['expense-claims.view', 'payroll.view'] } },
      );
      const bystander = await createUser({ roleSlug: 'employee' });
      await User.updateOne({ _id: bystander.user._id }, { $set: { customPermissions: ['payroll.view'] } });
      const deleted = await createUser({ roleSlug: 'employee' });
      await User.updateOne(
        { _id: deleted.user._id },
        { $set: { customPermissions: ['settings.view'], isDeleted: true } },
      );

      const snapshotUser = async (id: unknown): Promise<string> =>
        JSON.stringify(
          await User.findById(id).setOptions({ withDeleted: true }).select('+password').lean().exec(),
        );
      const systemBefore = await snapshotSystemRoles();
      const holderBefore = JSON.parse(await snapshotUser(holder.user._id));
      const bystanderBefore = await snapshotUser(bystander.user._id);
      const cleanBefore = JSON.stringify(await Role.findById(clean._id).lean().exec());

      const result = await ensureSystemRoles();
      expect(result).toEqual({ created: 0, refreshed: 0, strippedRoles: 1, strippedUsers: 2 });

      const legacyAfter = await Role.findById(legacy._id).orFail().lean().exec();
      expect(legacyAfter.permissions).toEqual(['employees.view', '*']);

      const holderAfter = JSON.parse(await snapshotUser(holder.user._id));
      expect(holderAfter.customPermissions).toEqual(['payroll.view']);
      // Only customPermissions changed: the password hash and every other field are as they were.
      expect({ ...holderAfter, customPermissions: null, updatedAt: null }).toEqual({
        ...holderBefore,
        customPermissions: null,
        updatedAt: null,
      });
      const deletedAfter = await User.findById(deleted.user._id)
        .setOptions({ withDeleted: true })
        .orFail()
        .lean()
        .exec();
      expect(deletedAfter.customPermissions).toEqual([]);

      expect(await snapshotSystemRoles()).toBe(systemBefore);
      expect(await snapshotUser(bystander.user._id)).toBe(bystanderBefore);
      expect(JSON.stringify(await Role.findById(clean._id).lean().exec())).toBe(cleanBefore);

      // Idempotent: nothing left to strip.
      expect(await ensureSystemRoles()).toEqual({
        created: 0,
        refreshed: 0,
        strippedRoles: 0,
        strippedUsers: 0,
      });
    });

    it('renamed field permissions are replaced by their new names, never just stripped', async () => {
      await ensureSystemRoles();
      const custom = await Role.create({
        name: 'HR (custom)',
        slug: 'hr-manager',
        permissions: ['employees.view', 'field-sales.view', 'field-sales.manage'],
      });
      const both = await Role.create({ name: 'Both', slug: 'both', permissions: ['field.view', 'field-sales.view'] });
      const holder = await createUser({ roleSlug: 'employee' });
      await User.updateOne({ _id: holder.user._id }, { $set: { customPermissions: ['field-sales.view', 'payroll.view'] } });

      const result = await ensureSystemRoles();
      expect(result).toMatchObject({ strippedRoles: 2, strippedUsers: 1 });
      expect((await Role.findById(custom._id).orFail().lean().exec()).permissions).toEqual([
        'employees.view',
        'field.view',
        'field.manage',
      ]);
      expect((await Role.findById(both._id).orFail().lean().exec()).permissions).toEqual(['field.view']);
      expect((await User.findById(holder.user._id).orFail().lean().exec()).customPermissions).toEqual([
        'field.view',
        'payroll.view',
      ]);
    });

    it('never touches a system role, even one holding an unknown name', async () => {
      await ensureSystemRoles();
      await Role.updateOne({ slug: 'manager' }, { $set: { permissions: ['not.real'] } });
      // The system role is restored to its contract by the refresh, not by the strip.
      const result = await ensureSystemRoles();
      expect(result).toMatchObject({ refreshed: 1, strippedRoles: 0 });
      const manager = await Role.findOne({ slug: 'manager' }).orFail().lean().exec();
      expect(manager.permissions).toEqual(
        DEFAULT_ROLES.find((role) => role.slug === 'manager')!.permissions,
      );
    });
  });
});
