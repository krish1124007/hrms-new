import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createMilestoneSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    dueDate: z.ZodOptional<z.ZodDate>;
    status: z.ZodOptional<z.ZodEnum<["pending", "completed"]>>;
    order: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    title: string;
    status?: "pending" | "completed" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    order?: number | undefined;
}, {
    title: string;
    status?: "pending" | "completed" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    order?: number | undefined;
}>;
export declare const updateMilestoneSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    dueDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<["pending", "completed"]>>>;
    order: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    status?: "pending" | "completed" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    dueDate?: Date | undefined;
    order?: number | undefined;
}, {
    status?: "pending" | "completed" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    dueDate?: Date | undefined;
    order?: number | undefined;
}>;
export declare function listMilestones(req: Request, res: Response): Promise<void>;
export declare function createMilestone(req: Request, res: Response): Promise<void>;
export declare function updateMilestone(req: Request, res: Response): Promise<void>;
export declare function deleteMilestone(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=milestones.controller.d.ts.map