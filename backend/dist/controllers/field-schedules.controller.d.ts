import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createScheduleSchema: z.ZodObject<{
    siteId: z.ZodEffects<z.ZodString, string, string>;
    /** Omitted: the caller. */
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    purpose: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
    rule: z.ZodEffects<z.ZodObject<{
        freq: z.ZodEnum<["weekly", "monthly"]>;
        /** 1 = Monday … 7 = Sunday. */
        weekdays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        /** 1–28, so every month has the day. */
        dayOfMonth: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodEffects<z.ZodString, string, string>;
        endDate: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    }, "strip", z.ZodTypeAny, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }>, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }>;
}, "strip", z.ZodTypeAny, {
    siteId: string;
    purpose: string;
    rule: {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    };
    employeeId?: string | undefined;
    notes?: string | undefined;
}, {
    siteId: string;
    purpose: string;
    rule: {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    };
    employeeId?: string | undefined;
    notes?: string | undefined;
}>;
export declare const updateScheduleSchema: z.ZodObject<{
    siteId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    purpose: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    rule: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        freq: z.ZodEnum<["weekly", "monthly"]>;
        /** 1 = Monday … 7 = Sunday. */
        weekdays: z.ZodOptional<z.ZodArray<z.ZodNumber, "many">>;
        /** 1–28, so every month has the day. */
        dayOfMonth: z.ZodOptional<z.ZodNumber>;
        startDate: z.ZodEffects<z.ZodString, string, string>;
        endDate: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    }, "strip", z.ZodTypeAny, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }>, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }, {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    employeeId?: string | undefined;
    siteId?: string | undefined;
    purpose?: string | undefined;
    rule?: {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    } | undefined;
    notes?: string | null | undefined;
}, {
    employeeId?: string | undefined;
    siteId?: string | undefined;
    purpose?: string | undefined;
    rule?: {
        startDate: string;
        freq: "weekly" | "monthly";
        endDate?: string | null | undefined;
        weekdays?: number[] | undefined;
        dayOfMonth?: number | undefined;
    } | undefined;
    notes?: string | null | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    siteId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    employeeId?: string | undefined;
    siteId?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    siteId?: string | undefined;
}>;
/** GET /field/visit-schedules */
export declare function listSchedules(req: Request, res: Response): Promise<void>;
/** GET /field/visit-schedules/:id */
export declare function getSchedule(req: Request, res: Response): Promise<void>;
/** POST /field/visit-schedules — and plan its visits for the next 7 days. */
export declare function createSchedule(req: Request, res: Response): Promise<void>;
/** PATCH /field/visit-schedules/:id — then re-plan from tomorrow on. */
export declare function updateSchedule(req: Request, res: Response): Promise<void>;
/** DELETE /field/visit-schedules/:id — soft delete; planned visits from tomorrow on go. */
export declare function deleteSchedule(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-schedules.controller.d.ts.map