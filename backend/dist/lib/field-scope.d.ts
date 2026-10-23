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
import { AppError } from './errors.js';
export declare const FIELD_VIEW = "field.view";
export declare const FIELD_MANAGE = "field.manage";
export interface FieldScope {
    /** `'all'` for a field manager, else the caller and their direct reports. */
    employeeIds: Types.ObjectId[] | 'all';
    /** The caller's own Employee `_id` (null for an admin without an employee record). */
    self: Types.ObjectId | null;
    /** True for a `field.manage` holder. */
    manage: boolean;
}
/** True when the caller holds `field.manage` (or `*`). */
export declare function canManageField(req: Request): boolean;
/** 404 `NO_EMPLOYEE_PROFILE` — a self-service field action needs an employee record. */
export declare function noEmployeeProfile(): AppError;
/** The caller's scope (see the header). */
export declare function fieldScope(req: Request): Promise<FieldScope>;
/** True when `employeeId` (an id, string or populated doc) is inside the scope. */
export declare function scopeIncludes(scope: FieldScope, employeeId: unknown): boolean;
/** Mongo filter restricting `field` (default `employeeId`) to the scope; `{}` for everybody. */
export declare function scopeFilter(scope: FieldScope, field?: string): Record<string, unknown>;
//# sourceMappingURL=field-scope.d.ts.map