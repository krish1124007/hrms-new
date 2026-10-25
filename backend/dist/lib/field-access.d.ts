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
export { FIELD_MANAGE, FIELD_VIEW, canManageField, noEmployeeProfile } from './field-scope.js';
/** The caller's Employee `_id`, or 404 `NO_EMPLOYEE_PROFILE`. */
export declare function requireOwnEmployeeId(req: Request): Promise<Types.ObjectId>;
/**
 * Employee ids whose field records the caller may read: `null` for a field
 * manager (everyone), otherwise themselves plus their direct reports. A
 * non-manager without an employee record gets 404 `NO_EMPLOYEE_PROFILE`.
 */
export declare function visibleEmployeeIds(req: Request): Promise<Types.ObjectId[] | null>;
/**
 * List filter on `field` (the owning employee). A field manager may narrow to
 * any `requested` employee; anyone else to one of the employees they can see —
 * a request outside that scope is ignored (they keep getting their own scope).
 */
export declare function listScopeFilter(req: Request, requested?: string, field?: string): Promise<Record<string, unknown>>;
/** 403 unless the caller may read a record owned by `owner` (manager, owner, or owner's manager). */
export declare function assertFieldRead(req: Request, owner: unknown): Promise<void>;
/** 403 unless the caller may change a record owned by `owner` (field manager or the owner). */
export declare function assertFieldWrite(req: Request, owner: unknown): Promise<void>;
/**
 * The employee a new record belongs to: a field manager may name anyone in
 * `bodyEmployeeId`; everyone else always gets their own record.
 */
export declare function ownerForCreate(req: Request, bodyEmployeeId?: string): Promise<Types.ObjectId>;
/** 400 unless `id` names an existing (not deleted) employee. */
export declare function assertEmployeeExists(id: string): Promise<void>;
/** 400 code when field work is planned or assigned for someone whose login lacks `field.view`. */
export declare const EMPLOYEE_NO_FIELD_ACCESS = "EMPLOYEE_NO_FIELD_ACCESS";
/** True when a stored permission list (role + custom) lets its holder into Field Visits. */
export declare function grantsFieldView(permissions: readonly string[]): boolean;
/** Why an employee cannot use Field Visits: no login at all, or a login without `field.view`. */
export type NoFieldAccessReason = 'no_login' | 'no_permission';
/**
 * For each employee id: `null` when their login holds `field.view` (through
 * its role or custom permissions — the same union `requirePermission`
 * checks), else why not. An employee with no login, or whose login was
 * deleted, has no access. Ids that name no employee are left out of the map.
 */
export declare function fieldAccessFor(employeeIds: ReadonlyArray<string | Types.ObjectId>): Promise<Map<string, NoFieldAccessReason | null>>;
/**
 * 400 `EMPLOYEE_NO_FIELD_ACCESS` unless `employeeId`'s login may use Field
 * Visits: a visit, recurring visit or task for them could never be checked
 * in or completed (they would see "No access"), so it is refused up front.
 * Call it after the scope and existence checks.
 */
export declare function assertEmployeeHasFieldAccess(employeeId: string | Types.ObjectId): Promise<void>;
//# sourceMappingURL=field-access.d.ts.map