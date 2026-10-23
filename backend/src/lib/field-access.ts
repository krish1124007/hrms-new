/**
 * Who may see and change which field record (visits, tasks).
 *
 *   • `field.manage` — field managers / HR: every employee's records, and the
 *     manager-only actions.
 *   • `field.view` holders with direct reports (team leads) — read their own
 *     records and their direct reports' (`reportingManager` = them), but
 *     change only their own.
 *   • every other `field.view` holder — their own records only.
 *
 * Ownership is the record's Employee (`employeeId`, or `assignedTo` for tasks),
 * always taken from the session on create — never from the request body.
 * The scope itself lives in lib/field-scope.ts.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { assertOwnOrPermission, currentEmployeeId, idOf } from './access.js';
import { ForbiddenError, ValidationAppError } from './errors.js';
import { Employee } from '../models/employee.model.js';
import { FIELD_MANAGE, canManageField, fieldScope, noEmployeeProfile } from './field-scope.js';

export { FIELD_MANAGE, FIELD_VIEW, canManageField, noEmployeeProfile } from './field-scope.js';

/** The caller's Employee `_id`, or 404 `NO_EMPLOYEE_PROFILE`. */
export async function requireOwnEmployeeId(req: Request): Promise<Types.ObjectId> {
  const id = await currentEmployeeId(req);
  if (!id) throw noEmployeeProfile();
  return id;
}

/**
 * Employee ids whose field records the caller may read: `null` for a field
 * manager (everyone), otherwise themselves plus their direct reports. A
 * non-manager without an employee record gets 404 `NO_EMPLOYEE_PROFILE`.
 */
export async function visibleEmployeeIds(req: Request): Promise<Types.ObjectId[] | null> {
  const scope = await fieldScope(req);
  return scope.employeeIds === 'all' ? null : scope.employeeIds;
}

/**
 * List filter on `field` (the owning employee). A field manager may narrow to
 * any `requested` employee; anyone else to one of the employees they can see —
 * a request outside that scope is ignored (they keep getting their own scope).
 */
export async function listScopeFilter(
  req: Request,
  requested?: string,
  field = 'employeeId',
): Promise<Record<string, unknown>> {
  const ids = await visibleEmployeeIds(req);
  const wanted = requested && Types.ObjectId.isValid(requested) ? new Types.ObjectId(requested) : null;
  if (ids === null) return wanted ? { [field]: wanted } : {};
  if (wanted && ids.some((id) => id.equals(wanted))) return { [field]: wanted };
  return { [field]: { $in: ids } };
}

/** 403 unless the caller may read a record owned by `owner` (manager, owner, or owner's manager). */
export async function assertFieldRead(req: Request, owner: unknown): Promise<void> {
  if (canManageField(req)) return;
  const ownerId = idOf(owner);
  const ids = await visibleEmployeeIds(req);
  if (ownerId && ids?.some((id) => id.toHexString() === ownerId)) return;
  throw new ForbiddenError('You can only access your own records');
}

/** 403 unless the caller may change a record owned by `owner` (field manager or the owner). */
export async function assertFieldWrite(req: Request, owner: unknown): Promise<void> {
  await assertOwnOrPermission(req, owner, FIELD_MANAGE);
}

/**
 * The employee a new record belongs to: a field manager may name anyone in
 * `bodyEmployeeId`; everyone else always gets their own record.
 */
export async function ownerForCreate(req: Request, bodyEmployeeId?: string): Promise<Types.ObjectId> {
  if (canManageField(req) && bodyEmployeeId) {
    await assertEmployeeExists(bodyEmployeeId);
    return new Types.ObjectId(bodyEmployeeId);
  }
  return requireOwnEmployeeId(req);
}

/** 400 unless `id` names an existing (not deleted) employee. */
export async function assertEmployeeExists(id: string): Promise<void> {
  const exists = Types.ObjectId.isValid(id) && (await Employee.exists({ _id: id }).exec());
  if (!exists) throw new ValidationAppError('employeeId does not name an employee');
}
