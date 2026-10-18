import type { Request } from 'express';
import { Types } from 'mongoose';
import { describe, it, expect, vi } from 'vitest';
import {
  assertCanDecide,
  assertOwnOrCanDecide,
  canDecide,
  canSeeAll,
  directReportIds,
  isApprover,
  scopeFilter,
  scopeFilterFor,
  type ApprovalModule,
} from './approvals.js';
import { AppError, ForbiddenError } from './errors.js';
import { Employee } from '../models/employee.model.js';
import { createUser, createEmployeeFor } from '../test/factories.js';

/** A request whose user holds exactly `perms` (the role is not looked up). */
function reqWith(userId: Types.ObjectId | undefined, perms: string[]): Request {
  const user = userId
    ? { _id: userId, role: { permissions: perms }, customPermissions: [] as string[] }
    : undefined;
  return { user } as unknown as Request;
}

/** A real user + employee, and a request carrying `perms`. */
async function caller(perms: string[]) {
  const { user } = await createUser({ roleSlug: 'employee' });
  const employee = await createEmployeeFor(user);
  return { employee, req: reqWith(user._id as Types.ObjectId, perms) };
}

/** An employee who reports to `manager`. */
async function reportOf(manager: { _id: unknown }) {
  const { user } = await createUser({ roleSlug: 'employee' });
  return createEmployeeFor(user, { reportingManager: manager._id });
}

async function stranger() {
  const { user } = await createUser({ roleSlug: 'employee' });
  return createEmployeeFor(user);
}

const MODULES: ApprovalModule[] = ['leaves', 'expenses', 'overtime', 'attendance'];

describe('canSeeAll', () => {
  it('is granted by <module>.approve_all for leaves, expenses and overtime', () => {
    for (const module of ['leaves', 'expenses', 'overtime'] as const) {
      expect(canSeeAll(reqWith(new Types.ObjectId(), [`${module}.approve_all`]), module)).toBe(true);
    }
  });

  it('is not granted by the plain approve permission', () => {
    for (const module of MODULES) {
      expect(canSeeAll(reqWith(new Types.ObjectId(), [`${module}.approve`]), module)).toBe(false);
    }
  });

  it("is granted by each module's HR permission: leaves.update, attendance.manage", () => {
    expect(canSeeAll(reqWith(new Types.ObjectId(), ['leaves.update']), 'leaves')).toBe(true);
    expect(canSeeAll(reqWith(new Types.ObjectId(), ['attendance.manage']), 'attendance')).toBe(true);
  });

  it('leaves.update does not widen expenses or overtime; attendance.manage does not widen leaves', () => {
    const req = reqWith(new Types.ObjectId(), ['leaves.update', 'attendance.manage']);
    expect(canSeeAll(req, 'expenses')).toBe(false);
    expect(canSeeAll(req, 'overtime')).toBe(false);
    expect(canSeeAll(req, 'attendance')).toBe(true);
  });

  it('is granted to the * wildcard everywhere, and to nobody without a user', () => {
    for (const module of MODULES) {
      expect(canSeeAll(reqWith(new Types.ObjectId(), ['*']), module)).toBe(true);
      expect(canSeeAll(reqWith(undefined, []), module)).toBe(false);
    }
  });
});

describe('isApprover', () => {
  it('is true for plain approve and for see-all, false otherwise', () => {
    expect(isApprover(reqWith(new Types.ObjectId(), ['expenses.approve']), 'expenses')).toBe(true);
    expect(isApprover(reqWith(new Types.ObjectId(), ['expenses.approve_all']), 'expenses')).toBe(true);
    expect(isApprover(reqWith(new Types.ObjectId(), ['expenses.view']), 'expenses')).toBe(false);
  });
});

describe('directReportIds', () => {
  it('returns the employees whose reportingManager is the caller, and nobody else', async () => {
    const { employee, req } = await caller(['leaves.approve']);
    const a = await reportOf(employee);
    const b = await reportOf(employee);
    await stranger();
    await reportOf(await stranger());

    const reports = await directReportIds(req);

    expect(reports.map(String).sort()).toEqual([String(a._id), String(b._id)].sort());
  });

  it('is empty when the caller has no employee record', async () => {
    const { user } = await createUser({ roleSlug: 'manager' });
    expect(await directReportIds(reqWith(user._id as Types.ObjectId, ['leaves.approve']))).toEqual([]);
  });

  it('is empty when the request is unauthenticated', async () => {
    expect(await directReportIds(reqWith(undefined, []))).toEqual([]);
  });

  it('queries once per request, however often and however concurrently it is asked', async () => {
    const { employee, req } = await caller(['leaves.approve']);
    await reportOf(employee);
    const spy = vi.spyOn(Employee, 'find');

    const [first] = await Promise.all([directReportIds(req), directReportIds(req)]);
    const again = await directReportIds(req);

    expect(spy).toHaveBeenCalledTimes(1);
    expect(again).toBe(first);
    spy.mockRestore();
  });
});

describe('canDecide / assertCanDecide', () => {
  it('passes anyone a see-all holder asks about, even one with no employee record of their own', async () => {
    const { user } = await createUser({ roleSlug: 'hr_manager' });
    const req = reqWith(user._id as Types.ObjectId, ['leaves.approve_all']);
    const other = await stranger();

    expect(await canDecide(req, other._id, 'leaves')).toBe(true);
    await expect(assertCanDecide(req, other._id, 'leaves')).resolves.toBeUndefined();
  });

  it('passes a plain approver for a direct report, including a populated owner field', async () => {
    const { employee, req } = await caller(['expenses.approve']);
    const report = await reportOf(employee);

    await expect(assertCanDecide(req, report._id, 'expenses')).resolves.toBeUndefined();
    await expect(assertCanDecide(req, String(report._id), 'expenses')).resolves.toBeUndefined();
    await expect(
      assertCanDecide(req, { _id: report._id, firstName: 'x' }, 'expenses'),
    ).resolves.toBeUndefined();
  });

  it('refuses a plain approver for anybody else: 403 NOT_YOUR_REPORT', async () => {
    const { req } = await caller(['overtime.approve']);
    const other = await stranger();

    const err = await assertCanDecide(req, other._id, 'overtime').catch((e: unknown) => e);

    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(403);
    expect((err as AppError).code).toBe('NOT_YOUR_REPORT');
  });

  it("refuses a caller's own record (self-approval is the controller's separate check)", async () => {
    const { employee, req } = await caller(['leaves.approve']);

    expect(await canDecide(req, employee._id, 'leaves')).toBe(false);
  });

  it("does not let one module's permission decide another module's requests", async () => {
    const { employee, req } = await caller(['leaves.approve']);
    const report = await reportOf(employee);

    expect(await canDecide(req, report._id, 'leaves')).toBe(true);
    expect(await canDecide(req, report._id, 'expenses')).toBe(false);
    expect(await canDecide(req, report._id, 'overtime')).toBe(false);
    expect(await canDecide(req, report._id, 'attendance')).toBe(false);
  });

  it('refuses a caller holding no approve permission, even for a direct report', async () => {
    const { employee, req } = await caller(['leaves.view']);
    const report = await reportOf(employee);

    const err = await assertCanDecide(req, report._id, 'leaves').catch((e: unknown) => e);

    expect((err as AppError).code).toBe('NOT_YOUR_REPORT');
  });

  it('refuses a plain approver who has no employee record', async () => {
    const { user } = await createUser({ roleSlug: 'manager' });
    const req = reqWith(user._id as Types.ObjectId, ['leaves.approve']);

    expect(await canDecide(req, (await stranger())._id, 'leaves')).toBe(false);
  });
});

describe('assertOwnOrCanDecide', () => {
  it('allows the owner, a deciding manager and a see-all holder', async () => {
    const { employee, req } = await caller(['expenses.approve']);
    const report = await reportOf(employee);

    await expect(assertOwnOrCanDecide(req, employee._id, 'expenses')).resolves.toBeUndefined();
    await expect(assertOwnOrCanDecide(req, report._id, 'expenses')).resolves.toBeUndefined();
    await expect(
      assertOwnOrCanDecide(reqWith(new Types.ObjectId(), ['expenses.approve_all']), report._id, 'expenses'),
    ).resolves.toBeUndefined();
  });

  it('forbids anybody else’s record with the same 403 as assertOwnOrPermission', async () => {
    const { req } = await caller(['expenses.approve']);

    const err = await assertOwnOrCanDecide(req, (await stranger())._id, 'expenses').catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ForbiddenError);
    expect((err as ForbiddenError).message).toBe('You can only access your own records');
  });
});

describe('scopeFilter', () => {
  it('is empty for a see-all holder', async () => {
    const { req } = await caller(['overtime.approve_all']);
    expect(await scopeFilter(req, 'overtime')).toEqual({});
  });

  it('is the reports plus the caller for a plain approver, on the requested field', async () => {
    const { employee, req } = await caller(['overtime.approve']);
    const report = await reportOf(employee);

    const filter = await scopeFilter(req, 'overtime', 'employee');

    expect(Object.keys(filter)).toEqual(['employee']);
    const ids = ((filter.employee as { $in: Types.ObjectId[] }).$in).map(String).sort();
    expect(ids).toEqual([String(report._id), String(employee._id)].sort());
  });

  it('defaults the field to employeeId', async () => {
    const { employee, req } = await caller(['leaves.approve']);

    const filter = await scopeFilter(req, 'leaves');

    expect(filter).toEqual({ employeeId: { $in: [employee._id] } });
  });

  it('is only the caller’s own employee for everybody else', async () => {
    const { employee, req } = await caller(['leaves.view']);
    await reportOf(employee);

    expect(await scopeFilter(req, 'leaves')).toEqual({ employeeId: employee._id });
  });

  it('is { field: null } — matching nothing — for a caller with no employee record', async () => {
    const { user } = await createUser({ roleSlug: 'employee' });

    expect(await scopeFilter(reqWith(user._id as Types.ObjectId, []), 'leaves')).toEqual({
      employeeId: null,
    });
  });

  it('a plain approver with no employee record matches no one', async () => {
    const { user } = await createUser({ roleSlug: 'manager' });

    expect(await scopeFilter(reqWith(user._id as Types.ObjectId, ['leaves.approve']), 'leaves')).toEqual({
      employeeId: { $in: [] },
    });
  });
});

describe('scopeFilterFor', () => {
  it('lets a see-all holder narrow to anyone', async () => {
    const { req } = await caller(['leaves.approve_all']);
    const other = await stranger();

    expect(await scopeFilterFor(req, 'leaves', String(other._id))).toEqual({ employeeId: other._id });
  });

  it('keeps a plain approver inside their reports and themselves', async () => {
    const { employee, req } = await caller(['leaves.approve']);
    const report = await reportOf(employee);
    const other = await stranger();

    expect(await scopeFilterFor(req, 'leaves', String(report._id))).toEqual({ employeeId: report._id });
    expect(await scopeFilterFor(req, 'leaves', String(employee._id))).toEqual({ employeeId: employee._id });
    expect(await scopeFilterFor(req, 'leaves', String(other._id))).toEqual({ employeeId: { $in: [] } });
  });

  it('ignores the request for everybody else — they only ever get their own', async () => {
    const { employee, req } = await caller(['leaves.view']);
    const other = await stranger();

    expect(await scopeFilterFor(req, 'leaves', String(other._id))).toEqual({ employeeId: employee._id });
  });

  it('is plain scopeFilter when nothing is asked for', async () => {
    const { req } = await caller(['leaves.approve_all']);
    expect(await scopeFilterFor(req, 'leaves', undefined)).toEqual({});
  });
});
