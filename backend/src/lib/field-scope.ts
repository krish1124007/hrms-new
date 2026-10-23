/**
 * Whose field records (visits, sites, tasks, routes, reports) the caller sees.
 *
 *   • `field.manage` (or the admin wildcard) — everybody: `employeeIds: 'all'`.
 *   • `field.view` — themselves plus their direct reports (employees whose
 *     `reportingManager` is the caller's employee record).
 *
 * A `field.view` holder without an employee record has nothing to be scoped
 * to: 404 `NO_EMPLOYEE_PROFILE` (never a silent empty list). A field manager
 * without one (an admin) still sees everybody; `self` is then null.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { currentEmployeeId, hasPermission, idOf } from './access.js';
import { directReportIds } from './approvals.js';
import { AppError } from './errors.js';

export const FIELD_VIEW = 'field.view';
export const FIELD_MANAGE = 'field.manage';

export interface FieldScope {
  /** `'all'` for a field manager, else the caller and their direct reports. */
  employeeIds: Types.ObjectId[] | 'all';
  /** The caller's own Employee `_id` (null for an admin without an employee record). */
  self: Types.ObjectId | null;
  /** True for a `field.manage` holder. */
  manage: boolean;
}

/** True when the caller holds `field.manage` (or `*`). */
export function canManageField(req: Request): boolean {
  return hasPermission(req.user, FIELD_MANAGE);
}

/** 404 `NO_EMPLOYEE_PROFILE` — a self-service field action needs an employee record. */
export function noEmployeeProfile(): AppError {
  return new AppError('No employee profile is linked to your account', 404, 'NO_EMPLOYEE_PROFILE');
}

/** The caller's scope (see the header). */
export async function fieldScope(req: Request): Promise<FieldScope> {
  const self = await currentEmployeeId(req);
  if (canManageField(req)) return { employeeIds: 'all', self, manage: true };
  if (!self) throw noEmployeeProfile();
  return { employeeIds: [self, ...(await directReportIds(req))], self, manage: false };
}

/** True when `employeeId` (an id, string or populated doc) is inside the scope. */
export function scopeIncludes(scope: FieldScope, employeeId: unknown): boolean {
  if (scope.employeeIds === 'all') return true;
  const id = idOf(employeeId);
  return id !== null && scope.employeeIds.some((e) => e.toHexString() === id);
}

/** Mongo filter restricting `field` (default `employeeId`) to the scope; `{}` for everybody. */
export function scopeFilter(scope: FieldScope, field = 'employeeId'): Record<string, unknown> {
  return scope.employeeIds === 'all' ? {} : { [field]: { $in: scope.employeeIds } };
}
