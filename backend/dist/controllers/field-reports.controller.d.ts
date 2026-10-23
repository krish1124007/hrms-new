/**
 * Field reports (scope I): a day's timeline per employee, a summary grouped
 * by employee / site / purpose, the exceptions list and the site-wise report.
 * JSON by default; `?format=xlsx|pdf` downloads the same report as a file
 * (services/field-report-export.service.ts).
 *
 * Scope (lib/field-scope.ts): `field.view` — the caller and their direct
 * reports; `field.manage` — everybody. A visit belongs to the IST day of its
 * check-in; a missed plan to its planned day. Cancelled visits are left out.
 * Ranges are `from`..`to` inclusive (`YYYY-MM-DD`, default this month to
 * date), at most 92 days.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const MAX_RANGE_DAYS = 92;
export declare const dailyQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    date: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    format: z.ZodOptional<z.ZodEnum<["xlsx", "pdf"]>>;
}, "strip", z.ZodTypeAny, {
    date?: string | undefined;
    employeeId?: string | undefined;
    format?: "xlsx" | "pdf" | undefined;
}, {
    date?: string | undefined;
    employeeId?: string | undefined;
    format?: "xlsx" | "pdf" | undefined;
}>;
export declare const summaryQuerySchema: z.ZodObject<{
    groupBy: z.ZodDefault<z.ZodEnum<["employee", "site", "purpose"]>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    format: z.ZodOptional<z.ZodEnum<["xlsx", "pdf"]>>;
}, "strip", z.ZodTypeAny, {
    groupBy: "purpose" | "employee" | "site";
    format?: "xlsx" | "pdf" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    format?: "xlsx" | "pdf" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    groupBy?: "purpose" | "employee" | "site" | undefined;
}>;
export declare const rangeQuerySchema: z.ZodObject<{
    from: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    format: z.ZodOptional<z.ZodEnum<["xlsx", "pdf"]>>;
}, "strip", z.ZodTypeAny, {
    format?: "xlsx" | "pdf" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}, {
    format?: "xlsx" | "pdf" | undefined;
    from?: string | undefined;
    to?: string | undefined;
}>;
export interface SiteRef {
    _id: string;
    name: string;
    type: string;
}
/**
 * `GET /field/reports/daily?employeeId&date` (employee default: the caller)
 * → `{ date, employee, visits, points, legs, totalKm, estimated }`: the
 * visits checked in that day and the plans for it still unvisited, each with
 * its work report; the day's route.
 */
export declare function dailyReport(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/reports/summary?from&to&groupBy=employee|site|purpose` →
 * `[{ key, label, visits, completed, missed, minutesOnSite, km }]` by label.
 * `visits`: checked in; `missed`: plans for the range never visited;
 * `minutesOnSite`: summed visit durations. `km`: by employee, the day routes'
 * total; by site or purpose, the legs that arrive at a visit of that group
 * (the travel to reach it).
 */
export declare function summaryReport(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/reports/exceptions?from&to` → `[{ visitId, employee, site,
 * date, type, detail }]`, oldest first: one row per exception flag of a
 * visit (away from site, no GPS, no selfie, short visit, auto-closed, synced
 * late) and one per missed plan.
 */
export declare function exceptionsReport(req: Request, res: Response): Promise<void>;
/**
 * `GET /field/reports/sites?from&to` → `[{ site, visits, lastVisitAt,
 * employees: [{ _id, firstName, lastName, employeeId }], employeeCount }]`,
 * most visited first: the visits checked in at each site in the range and
 * who made them.
 */
export declare function sitesReport(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-reports.controller.d.ts.map