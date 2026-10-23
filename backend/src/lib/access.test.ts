import type { Request } from 'express';
import { Types } from 'mongoose';
import { describe, it, expect, vi } from 'vitest';
import {
  hasPermission,
  currentEmployeeId,
  assertOwnOrPermission,
  assertNotSelfApproval,
} from './access.js';
import { AppError, ForbiddenError } from './errors.js';
import { Employee } from '../models/employee.model.js';
import { User } from '../models/user.model.js';
import { createUser, createEmployeeFor } from '../test/factories.js';

/** A minimal `req.user` — only the fields the access helpers read. */
function fakeUser(rolePerms: string[], customPermissions: string[] = []): Request['user'] {
  return {
    _id: new Types.ObjectId(),
    role: { permissions: rolePerms },
    customPermissions,
  } as unknown as Request['user'];
}

/** A request carrying the given (real) user. */
function reqFor(user: unknown): Request {
  return { user } as unknown as Request;
}

describe('hasPermission', () => {
  it('passes everything for the * wildcard', () => {
    expect(hasPermission(fakeUser(['*']), 'notices.manage')).toBe(true);
  });

  it('passes an exact role permission', () => {
    expect(hasPermission(fakeUser(['expenses.approve']), 'expenses.approve')).toBe(true);
  });

  it('fails a permission the user does not hold', () => {
    expect(hasPermission(fakeUser(['expenses.view']), 'expenses.approve')).toBe(false);
  });

  it('honours customPermissions on the user', () => {
    expect(hasPermission(fakeUser([], ['field.manage']), 'field.manage')).toBe(true);
  });

  it('fails when there is no user', () => {
    expect(hasPermission(undefined, 'notices.manage')).toBe(false);
  });
});

describe('currentEmployeeId', () => {
  it("returns the caller's employee _id and caches it on the request", async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(user);
    const req = reqFor(user);
    const spy = vi.spyOn(Employee, 'findOne');

    const first = await currentEmployeeId(req);
    const second = await currentEmployeeId(req);

    expect(String(first)).toBe(String(employee._id));
    expect(String(second)).toBe(String(employee._id));
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('returns null when the user has no employee record', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    expect(await currentEmployeeId(reqFor(user))).toBeNull();
  });

  it('returns null when the request is unauthenticated', async () => {
    expect(await currentEmployeeId(reqFor(undefined))).toBeNull();
  });
});

describe('assertOwnOrPermission', () => {
  it('allows the owner', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(user);
    await expect(
      assertOwnOrPermission(reqFor(user), employee._id, 'overtime.view'),
    ).resolves.toBeUndefined();
  });

  it('allows the owner when the owner field is populated', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(user);
    await expect(
      assertOwnOrPermission(reqFor(user), { _id: employee._id, firstName: 'x' }, 'overtime.view'),
    ).resolves.toBeUndefined();
  });

  it('allows the owner when the owner id is a string', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    const employee = await createEmployeeFor(user);
    await expect(
      assertOwnOrPermission(reqFor(user), String(employee._id), 'overtime.view'),
    ).resolves.toBeUndefined();
  });

  it("allows someone else's record with the permission", async () => {
    const { user } = await createUser({ roleSlug: 'admin' });
    // As authMiddleware leaves it: role populated, so its permissions are readable.
    const authed = await User.findById(user._id).populate('role').orFail();
    await expect(
      assertOwnOrPermission(reqFor(authed), new Types.ObjectId(), 'overtime.view'),
    ).resolves.toBeUndefined();
  });

  it("forbids someone else's record without the permission", async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    await createEmployeeFor(user);
    const err = await assertOwnOrPermission(
      reqFor(user),
      new Types.ObjectId(),
      'overtime.view',
    ).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).statusCode).toBe(403);
    expect((err as ForbiddenError).message).toBe('You can only access your own records');
  });

  it('accepts a list of permissions — any one of them is enough', async () => {
    // hr_manager holds leaves.approve but not users.delete / roles.delete.
    const { user } = await createUser({ roleSlug: 'hr_manager' });
    const authed = await User.findById(user._id).populate('role').orFail();
    const someoneElse = new Types.ObjectId();
    await expect(
      assertOwnOrPermission(reqFor(authed), someoneElse, ['users.delete', 'leaves.approve']),
    ).resolves.toBeUndefined();
    await expect(
      assertOwnOrPermission(reqFor(authed), someoneElse, ['users.delete', 'roles.delete']),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('treats a caller without an employee record as not the owner', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });
    await expect(
      assertOwnOrPermission(reqFor(user), null, 'overtime.view'),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      assertOwnOrPermission(reqFor(user), new Types.ObjectId(), 'overtime.view'),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('assertNotSelfApproval', () => {
  it('403 SELF_APPROVAL on the caller’s own record, even for an admin', async () => {
    const { user } = await createUser({ roleSlug: 'admin' });
    const employee = await createEmployeeFor(user);
    const authed = await User.findById(user._id).populate('role').orFail();
    const err = await assertNotSelfApproval(reqFor(authed), employee._id, 'nope').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).code).toBe('SELF_APPROVAL');
    expect((err as AppError).message).toBe('nope');
  });

  it('passes for somebody else’s record, or a caller without an employee record', async () => {
    const { user } = await createUser({ roleSlug: 'admin' });
    await expect(
      assertNotSelfApproval(reqFor(user), new Types.ObjectId(), 'nope'),
    ).resolves.toBeUndefined();
    await createEmployeeFor(user);
    const fresh = reqFor(user);
    await expect(
      assertNotSelfApproval(fresh, new Types.ObjectId(), 'nope'),
    ).resolves.toBeUndefined();
  });
});
