import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createShiftSchema: z.ZodObject<{
    name: z.ZodString;
    startTime: z.ZodString;
    endTime: z.ZodString;
    graceMinutes: z.ZodDefault<z.ZodNumber>;
    halfDayHours: z.ZodDefault<z.ZodNumber>;
    fullDayHours: z.ZodDefault<z.ZodNumber>;
    workDays: z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>;
    isNightShift: z.ZodDefault<z.ZodBoolean>;
    breakDuration: z.ZodDefault<z.ZodNumber>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    color: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    startTime: string;
    endTime: string;
    color: string;
    graceMinutes: number;
    halfDayHours: number;
    fullDayHours: number;
    workDays: number[];
    isNightShift: boolean;
    breakDuration: number;
    isDefault: boolean;
}, {
    name: string;
    startTime: string;
    endTime: string;
    color?: string | undefined;
    graceMinutes?: number | undefined;
    halfDayHours?: number | undefined;
    fullDayHours?: number | undefined;
    workDays?: number[] | undefined;
    isNightShift?: boolean | undefined;
    breakDuration?: number | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const updateShiftSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    startTime: z.ZodOptional<z.ZodString>;
    endTime: z.ZodOptional<z.ZodString>;
    graceMinutes: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    halfDayHours: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    fullDayHours: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    workDays: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodNumber, "many">>>;
    isNightShift: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    breakDuration: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    isDefault: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    color: z.ZodOptional<z.ZodDefault<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    color?: string | undefined;
    graceMinutes?: number | undefined;
    halfDayHours?: number | undefined;
    fullDayHours?: number | undefined;
    workDays?: number[] | undefined;
    isNightShift?: boolean | undefined;
    breakDuration?: number | undefined;
    isDefault?: boolean | undefined;
}, {
    name?: string | undefined;
    startTime?: string | undefined;
    endTime?: string | undefined;
    color?: string | undefined;
    graceMinutes?: number | undefined;
    halfDayHours?: number | undefined;
    fullDayHours?: number | undefined;
    workDays?: number[] | undefined;
    isNightShift?: boolean | undefined;
    breakDuration?: number | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const assignShiftSchema: z.ZodObject<{
    employeeIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    employeeIds: string[];
}, {
    employeeIds: string[];
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
export declare function listShifts(req: Request, res: Response): Promise<void>;
export declare function createShift(req: Request, res: Response): Promise<void>;
export declare function getShift(req: Request, res: Response): Promise<void>;
export declare function updateShift(req: Request, res: Response): Promise<void>;
export declare function deleteShift(req: Request, res: Response): Promise<void>;
export declare function assignShift(req: Request, res: Response): Promise<void>;
export declare const rosterQuerySchema: z.ZodObject<{
    from: z.ZodString;
    to: z.ZodString;
    departmentId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    from: string;
    to: string;
    departmentId?: string | undefined;
}, {
    from: string;
    to: string;
    departmentId?: string | undefined;
}>;
/** GET /api/v1/shifts/my-roster?from=YYYY-MM-DD&to=YYYY-MM-DD */
export declare function myRoster(req: Request, res: Response): Promise<void>;
/** GET /api/v1/shifts/team-roster?from=…&to=…&departmentId=… */
export declare function teamRoster(req: Request, res: Response): Promise<void>;
export declare const swapRequestSchema: z.ZodObject<{
    assignmentId: z.ZodString;
    requestedWith: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    assignmentId: string;
    requestedWith: string;
}, {
    reason: string;
    assignmentId: string;
    requestedWith: string;
}>;
/**
 * POST /api/v1/shifts/swap-request
 *
 * Stub: persists the request as an audit entry until a dedicated
 * ShiftSwap model lands. The mobile UI still gets a 200 + toast.
 */
export declare function requestSwap(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=shifts.controller.d.ts.map