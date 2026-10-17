import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTimeEntrySchema: z.ZodObject<{
    taskId: z.ZodOptional<z.ZodString>;
    userId: z.ZodOptional<z.ZodString>;
    date: z.ZodDate;
    hours: z.ZodNumber;
    description: z.ZodOptional<z.ZodString>;
    isBillable: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    date: Date;
    hours: number;
    description?: string | undefined;
    userId?: string | undefined;
    taskId?: string | undefined;
    isBillable?: boolean | undefined;
}, {
    date: Date;
    hours: number;
    description?: string | undefined;
    userId?: string | undefined;
    taskId?: string | undefined;
    isBillable?: boolean | undefined;
}>;
export declare const updateTimeEntrySchema: z.ZodObject<{
    taskId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    userId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    date: z.ZodOptional<z.ZodDate>;
    hours: z.ZodOptional<z.ZodNumber>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    isBillable: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    date?: Date | undefined;
    description?: string | undefined;
    userId?: string | undefined;
    taskId?: string | undefined;
    hours?: number | undefined;
    isBillable?: boolean | undefined;
}, {
    date?: Date | undefined;
    description?: string | undefined;
    userId?: string | undefined;
    taskId?: string | undefined;
    hours?: number | undefined;
    isBillable?: boolean | undefined;
}>;
export declare function listTimeEntries(req: Request, res: Response): Promise<void>;
export declare function createTimeEntry(req: Request, res: Response): Promise<void>;
export declare function updateTimeEntry(req: Request, res: Response): Promise<void>;
export declare function deleteTimeEntry(req: Request, res: Response): Promise<void>;
export declare function getTimeEntrySummary(req: Request, res: Response): Promise<void>;
export declare function myTimesheets(req: Request, res: Response): Promise<void>;
export declare function weeklyTimesheet(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=time-entries.controller.d.ts.map