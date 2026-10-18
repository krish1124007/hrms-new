import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createHolidaySchema: z.ZodObject<{
    name: z.ZodString;
    date: z.ZodDate;
    type: z.ZodDefault<z.ZodEnum<["public", "optional", "restricted"]>>;
    departments: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isRecurring: z.ZodDefault<z.ZodBoolean>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "optional" | "public" | "restricted";
    date: Date;
    name: string;
    departments: string[];
    isRecurring: boolean;
    description?: string | undefined;
}, {
    date: Date;
    name: string;
    type?: "optional" | "public" | "restricted" | undefined;
    description?: string | undefined;
    departments?: string[] | undefined;
    isRecurring?: boolean | undefined;
}>;
export declare const updateHolidaySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    date: z.ZodOptional<z.ZodDate>;
    type: z.ZodOptional<z.ZodDefault<z.ZodEnum<["public", "optional", "restricted"]>>>;
    departments: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    isRecurring: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    type?: "optional" | "public" | "restricted" | undefined;
    date?: Date | undefined;
    name?: string | undefined;
    description?: string | undefined;
    departments?: string[] | undefined;
    isRecurring?: boolean | undefined;
}, {
    type?: "optional" | "public" | "restricted" | undefined;
    date?: Date | undefined;
    name?: string | undefined;
    description?: string | undefined;
    departments?: string[] | undefined;
    isRecurring?: boolean | undefined;
}>;
export declare const importCalendarSchema: z.ZodObject<{
    holidays: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        date: z.ZodDate;
        type: z.ZodDefault<z.ZodEnum<["public", "optional", "restricted"]>>;
    }, "strip", z.ZodTypeAny, {
        type: "optional" | "public" | "restricted";
        date: Date;
        name: string;
    }, {
        date: Date;
        name: string;
        type?: "optional" | "public" | "restricted" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    holidays: {
        type: "optional" | "public" | "restricted";
        date: Date;
        name: string;
    }[];
}, {
    holidays: {
        date: Date;
        name: string;
        type?: "optional" | "public" | "restricted" | undefined;
    }[];
}>;
export declare const rolloverSchema: z.ZodObject<{
    /** The year to copy the recurring holidays into, from the year before it. */
    year: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
}, {
    year: number;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    year: z.ZodOptional<z.ZodNumber>;
    type: z.ZodOptional<z.ZodEnum<["public", "optional", "restricted"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    type?: "optional" | "public" | "restricted" | undefined;
    year?: number | undefined;
}, {
    type?: "optional" | "public" | "restricted" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    year?: number | undefined;
}>;
export declare function listHolidays(req: Request, res: Response): Promise<void>;
export declare function upcomingHolidays(_req: Request, res: Response): Promise<void>;
export declare function createHoliday(req: Request, res: Response): Promise<void>;
export declare function getHoliday(req: Request, res: Response): Promise<void>;
export declare function updateHoliday(req: Request, res: Response): Promise<void>;
export declare function deleteHoliday(req: Request, res: Response): Promise<void>;
/**
 * POST /holidays/import-calendar — add the holidays not already in the
 * calendar. Each date is stored as its business-day label; a row matching an
 * existing holiday (same day, same name) or an earlier row of the payload is
 * skipped. Returns `{ created, skipped }`.
 */
export declare function importCalendar(req: Request, res: Response): Promise<void>;
/**
 * POST /holidays/rollover `{ year }` — copy every recurring holiday of
 * `year − 1` to the same month and day of `year` (29 Feb → 28 Feb when
 * `year` is not a leap year), skipping any already there (same day, same
 * name). Idempotent. Returns `{ created, skipped }`.
 */
export declare function rolloverHolidays(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=holidays.controller.d.ts.map