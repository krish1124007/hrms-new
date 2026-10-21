import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTaskSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    milestoneId: z.ZodOptional<z.ZodString>;
    assignee: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["todo", "in_progress", "in_review", "done"]>>;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    dueDate: z.ZodOptional<z.ZodDate>;
    estimatedHours: z.ZodOptional<z.ZodNumber>;
    labels: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    parentTask: z.ZodOptional<z.ZodString>;
    order: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    title: string;
    status?: "done" | "in_progress" | "todo" | "in_review" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    estimatedHours?: number | undefined;
    milestoneId?: string | undefined;
    assignee?: string | undefined;
    labels?: string[] | undefined;
    order?: number | undefined;
    parentTask?: string | undefined;
}, {
    title: string;
    status?: "done" | "in_progress" | "todo" | "in_review" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    estimatedHours?: number | undefined;
    milestoneId?: string | undefined;
    assignee?: string | undefined;
    labels?: string[] | undefined;
    order?: number | undefined;
    parentTask?: string | undefined;
}>;
export declare const updateTaskSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    milestoneId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    assignee: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<["todo", "in_progress", "in_review", "done"]>>>;
    priority: z.ZodOptional<z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>>;
    dueDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    estimatedHours: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    labels: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    parentTask: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    order: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    status?: "done" | "in_progress" | "todo" | "in_review" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    estimatedHours?: number | undefined;
    milestoneId?: string | undefined;
    assignee?: string | undefined;
    labels?: string[] | undefined;
    order?: number | undefined;
    parentTask?: string | undefined;
}, {
    status?: "done" | "in_progress" | "todo" | "in_review" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    title?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    estimatedHours?: number | undefined;
    milestoneId?: string | undefined;
    assignee?: string | undefined;
    labels?: string[] | undefined;
    order?: number | undefined;
    parentTask?: string | undefined;
}>;
export declare const updateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["todo", "in_progress", "in_review", "done"]>;
    order: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "done" | "in_progress" | "todo" | "in_review";
    order?: number | undefined;
}, {
    status: "done" | "in_progress" | "todo" | "in_review";
    order?: number | undefined;
}>;
export declare const reorderSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        _id: z.ZodString;
        status: z.ZodEnum<["todo", "in_progress", "in_review", "done"]>;
        order: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        status: "done" | "in_progress" | "todo" | "in_review";
        _id: string;
        order: number;
    }, {
        status: "done" | "in_progress" | "todo" | "in_review";
        _id: string;
        order: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        status: "done" | "in_progress" | "todo" | "in_review";
        _id: string;
        order: number;
    }[];
}, {
    items: {
        status: "done" | "in_progress" | "todo" | "in_review";
        _id: string;
        order: number;
    }[];
}>;
export declare function listTasks(req: Request, res: Response): Promise<void>;
export declare function createTask(req: Request, res: Response): Promise<void>;
export declare function getTask(req: Request, res: Response): Promise<void>;
export declare function updateTask(req: Request, res: Response): Promise<void>;
export declare function deleteTask(req: Request, res: Response): Promise<void>;
export declare function updateTaskStatus(req: Request, res: Response): Promise<void>;
export declare function reorderTasks(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=tasks.controller.d.ts.map