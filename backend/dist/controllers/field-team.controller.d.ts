/**
 * The team map's data: each person's status on an IST day and their day
 * route. Tracking is only at check-in/check-out points (attendance day in/out
 * and visit in/out), so "where" is the last such point.
 *
 * Scope (lib/field-scope.ts): `field.view` — the caller and their direct
 * reports; `field.manage` — every field employee (HR's "field staff" flag, or
 * a login whose role or own permissions give `field.view` without
 * `field.manage`), plus anyone who checked in at a site that day.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { type FieldScope } from '../lib/field-scope.js';
export declare const dayQuerySchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
}, {
    date?: string | undefined;
}>;
export type TeamStatus = 'at_site' | 'between_sites' | 'day_ended' | 'not_started';
export interface EmployeeRef {
    _id: string;
    firstName: string;
    lastName: string;
    employeeId: string;
}
export declare function employeeRef(e: {
    _id: unknown;
    firstName?: string;
    lastName?: string;
    employeeId?: string;
}): EmployeeRef;
export declare const fullName: (e: {
    firstName?: string;
    lastName?: string;
} | null | undefined) => string;
/** 403 `NOT_YOUR_REPORT` unless `employeeId` is in the caller's scope. */
export declare function assertInScope(scope: FieldScope, employeeId: string): void;
/** A 24-hex Employee id from the path, or 400. */
export declare function employeeIdParam(value: unknown): string;
/**
 * `GET /field/team/status?date=YYYY-MM-DD` (default today) — one row per
 * person in scope: `{ employee, status, currentVisit, lastPoint, visitsToday,
 * kmToday }` (`currentVisit` / `lastPoint` null when there is none).
 */
export declare function teamStatus(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/team/access` — which current employees in the caller's scope
 * (everyone for `field.manage`, else themselves and their direct reports)
 * cannot be given field work: `{ noAccess: { [employeeId]: 'no_login' |
 * 'no_permission' } }`. Anyone not listed holds `field.view`. Pickers flag
 * the listed people; planning a visit, a recurring visit or a task for them
 * is refused with 400 `EMPLOYEE_NO_FIELD_ACCESS`.
 */
export declare function teamAccess(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/route/:employeeId?date=YYYY-MM-DD` (default today) — `{ date,
 * points: [{ lat, lng, at, kind, siteName? }], legs: [{ fromIndex, toIndex,
 * distanceM, estimated }], totalKm, estimated }`. 403 outside the caller's
 * scope, 404 for an unknown employee.
 */
export declare function employeeRoute(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-team.controller.d.ts.map