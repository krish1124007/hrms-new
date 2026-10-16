import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTargetSchema: z.ZodObject<{
    employeeId: z.ZodString;
    period: z.ZodObject<{
        month: z.ZodNumber;
        year: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        month: number;
        year: number;
    }, {
        month: number;
        year: number;
    }>;
    type: z.ZodDefault<z.ZodEnum<["amount", "quantity", "visits"]>>;
    productCategory: z.ZodOptional<z.ZodString>;
    targetValue: z.ZodNumber;
    milestones: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodNumber;
        reward: z.ZodOptional<z.ZodString>;
        achieved: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        achieved: boolean;
        reward?: string | undefined;
    }, {
        value: number;
        reward?: string | undefined;
        achieved?: boolean | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "amount" | "quantity" | "visits";
    employeeId: string;
    period: {
        month: number;
        year: number;
    };
    targetValue: number;
    productCategory?: string | undefined;
    milestones?: {
        value: number;
        achieved: boolean;
        reward?: string | undefined;
    }[] | undefined;
}, {
    employeeId: string;
    period: {
        month: number;
        year: number;
    };
    targetValue: number;
    type?: "amount" | "quantity" | "visits" | undefined;
    productCategory?: string | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
        achieved?: boolean | undefined;
    }[] | undefined;
}>;
export declare const updateTargetSchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodString>;
    period: z.ZodOptional<z.ZodObject<{
        month: z.ZodNumber;
        year: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        month: number;
        year: number;
    }, {
        month: number;
        year: number;
    }>>;
    type: z.ZodOptional<z.ZodDefault<z.ZodEnum<["amount", "quantity", "visits"]>>>;
    productCategory: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    targetValue: z.ZodOptional<z.ZodNumber>;
    milestones: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodNumber;
        reward: z.ZodOptional<z.ZodString>;
        achieved: z.ZodDefault<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        achieved: boolean;
        reward?: string | undefined;
    }, {
        value: number;
        reward?: string | undefined;
        achieved?: boolean | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    type?: "amount" | "quantity" | "visits" | undefined;
    employeeId?: string | undefined;
    period?: {
        month: number;
        year: number;
    } | undefined;
    productCategory?: string | undefined;
    targetValue?: number | undefined;
    milestones?: {
        value: number;
        achieved: boolean;
        reward?: string | undefined;
    }[] | undefined;
}, {
    type?: "amount" | "quantity" | "visits" | undefined;
    employeeId?: string | undefined;
    period?: {
        month: number;
        year: number;
    } | undefined;
    productCategory?: string | undefined;
    targetValue?: number | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
        achieved?: boolean | undefined;
    }[] | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    month: z.ZodOptional<z.ZodNumber>;
    year: z.ZodOptional<z.ZodNumber>;
    type: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    type?: string | undefined;
    employeeId?: string | undefined;
    month?: number | undefined;
    year?: number | undefined;
}, {
    limit?: number | undefined;
    type?: string | undefined;
    page?: number | undefined;
    employeeId?: string | undefined;
    month?: number | undefined;
    year?: number | undefined;
}>;
export declare function listTargets(req: Request, res: Response): Promise<void>;
export declare function myTargets(_req: Request, res: Response): Promise<void>;
export declare function getTarget(req: Request, res: Response): Promise<void>;
export declare function createTarget(req: Request, res: Response): Promise<void>;
export declare function updateTarget(req: Request, res: Response): Promise<void>;
export declare function deleteTarget(req: Request, res: Response): Promise<void>;
export declare function leaderboard(req: Request, res: Response): Promise<void>;
export declare function teamSummary(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-targets.controller.d.ts.map