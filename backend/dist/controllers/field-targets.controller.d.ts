import type { Request, Response } from 'express';
import { z } from 'zod';
import { type ISalesTarget, type TargetStatus } from '../models/sales-target.model.js';
export declare const createTargetSchema: z.ZodObject<{
    employeeId: z.ZodEffects<z.ZodString, string, string>;
    period: z.ZodObject<{
        month: z.ZodNumber;
        year: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        year: number;
        month: number;
    }, {
        year: number;
        month: number;
    }>;
    type: z.ZodDefault<z.ZodEnum<["amount", "quantity", "visits"]>>;
    productCategory: z.ZodOptional<z.ZodString>;
    targetValue: z.ZodNumber;
    milestones: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodNumber;
        reward: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        reward?: string | undefined;
    }, {
        value: number;
        reward?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "amount" | "visits" | "quantity";
    employeeId: string;
    period: {
        year: number;
        month: number;
    };
    targetValue: number;
    productCategory?: string | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
    }[] | undefined;
}, {
    employeeId: string;
    period: {
        year: number;
        month: number;
    };
    targetValue: number;
    type?: "amount" | "visits" | "quantity" | undefined;
    productCategory?: string | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
    }[] | undefined;
}>;
export declare const updateTargetSchema: z.ZodObject<{
    period: z.ZodOptional<z.ZodObject<{
        month: z.ZodNumber;
        year: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        year: number;
        month: number;
    }, {
        year: number;
        month: number;
    }>>;
    type: z.ZodOptional<z.ZodEnum<["amount", "quantity", "visits"]>>;
    /** `null` clears the category (the target then counts every product). */
    productCategory: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    targetValue: z.ZodOptional<z.ZodNumber>;
    milestones: z.ZodOptional<z.ZodArray<z.ZodObject<{
        value: z.ZodNumber;
        reward: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        reward?: string | undefined;
    }, {
        value: number;
        reward?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type?: "amount" | "visits" | "quantity" | undefined;
    period?: {
        year: number;
        month: number;
    } | undefined;
    productCategory?: string | null | undefined;
    targetValue?: number | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
    }[] | undefined;
}, {
    type?: "amount" | "visits" | "quantity" | undefined;
    period?: {
        year: number;
        month: number;
    } | undefined;
    productCategory?: string | null | undefined;
    targetValue?: number | undefined;
    milestones?: {
        value: number;
        reward?: string | undefined;
    }[] | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    month: z.ZodOptional<z.ZodNumber>;
    year: z.ZodOptional<z.ZodNumber>;
    type: z.ZodOptional<z.ZodEnum<["amount", "quantity", "visits"]>>;
    page: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    type?: "amount" | "visits" | "quantity" | undefined;
    year?: number | undefined;
    employeeId?: string | undefined;
    month?: number | undefined;
}, {
    type?: "amount" | "visits" | "quantity" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    year?: number | undefined;
    employeeId?: string | undefined;
    month?: number | undefined;
}>;
export declare const periodQuerySchema: z.ZodObject<{
    month: z.ZodOptional<z.ZodNumber>;
    year: z.ZodOptional<z.ZodNumber>;
    type: z.ZodDefault<z.ZodEnum<["amount", "quantity", "visits"]>>;
}, "strip", z.ZodTypeAny, {
    type: "amount" | "visits" | "quantity";
    year?: number | undefined;
    month?: number | undefined;
}, {
    type?: "amount" | "visits" | "quantity" | undefined;
    year?: number | undefined;
    month?: number | undefined;
}>;
type TargetLike = Pick<ISalesTarget, 'employeeId' | 'period' | 'type' | 'targetValue' | 'productCategory'>;
/** The rep's achievement towards `target`, from source rows. */
export declare function achievedFor(target: TargetLike): Promise<number>;
/** On-track/behind/exceeded for `pct` % achieved in `period`, as of `now`. */
export declare function targetStatus(pct: number, period: {
    year: number;
    month: number;
}, now?: Date): TargetStatus;
export declare function listTargets(req: Request, res: Response): Promise<void>;
export declare function myTargets(req: Request, res: Response): Promise<void>;
export declare function getTarget(req: Request, res: Response): Promise<void>;
/** Field managers. Re-creating a target that was deleted revives that row with the new values. */
export declare function createTarget(req: Request, res: Response): Promise<void>;
export declare function updateTarget(req: Request, res: Response): Promise<void>;
export declare function deleteTarget(req: Request, res: Response): Promise<void>;
/** Every rep's target of one type for a month (default: this IST month, amount), best first. */
export declare function leaderboard(req: Request, res: Response): Promise<void>;
/** Targets vs achievement for one month and type, over the reps the caller can see. */
export declare function teamSummary(req: Request, res: Response): Promise<void>;
export {};
//# sourceMappingURL=field-targets.controller.d.ts.map