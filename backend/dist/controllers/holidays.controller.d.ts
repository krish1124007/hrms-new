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
export declare function importCalendar(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=holidays.controller.d.ts.map