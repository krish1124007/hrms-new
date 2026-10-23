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
//# sourceMappingURL=field-access.d.ts.map