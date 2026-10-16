import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTaskSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodString;
    clientId: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodOptional<z.ZodNumber>;
        lng: z.ZodOptional<z.ZodNumber>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    }, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    }>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "urgent"]>>;
    status: z.ZodDefault<z.ZodEnum<["new", "accepted", "in_progress", "completed", "cancelled"]>>;
    dueDate: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "new" | "in_progress" | "completed" | "accepted";
    assignedTo: string;
    title: string;
    priority: "low" | "medium" | "high" | "urgent";
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
    description?: string | undefined;
    clientId?: string | undefined;
    dueDate?: Date | undefined;
}, {
    assignedTo: string;
    title: string;
    status?: "cancelled" | "new" | "in_progress" | "completed" | "accepted" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
    description?: string | undefined;
    clientId?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    dueDate?: Date | undefined;
}>;
export declare const updateTaskSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    assignedTo: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    location: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        lat: z.ZodOptional<z.ZodNumber>;
        lng: z.ZodOptional<z.ZodNumber>;
        address: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    }, {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    }>>>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodEnum<["low", "medium", "high", "urgent"]>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["new", "accepted", "in_progress", "completed", "cancelled"]>>>;
    dueDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "new" | "in_progress" | "completed" | "accepted" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
    assignedTo?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    clientId?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    dueDate?: Date | undefined;
}, {
    status?: "cancelled" | "new" | "in_progress" | "completed" | "accepted" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
    assignedTo?: string | undefined;
    description?: string | undefined;
    title?: string | undefined;
    clientId?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    dueDate?: Date | undefined;
}>;
export declare const completeSchema: z.ZodObject<{
    completionPhotos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    completionNotes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
}, {
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    assignedTo: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    status?: string | undefined;
    assignedTo?: string | undefined;
    priority?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    status?: string | undefined;
    page?: number | undefined;
    assignedTo?: string | undefined;
    priority?: string | undefined;
}>;
export declare function listTasks(req: Request, res: Response): Promise<void>;
export declare function myTasks(_req: Request, res: Response): Promise<void>;
export declare function teamTasks(_req: Request, res: Response): Promise<void>;
export declare function getTask(req: Request, res: Response): Promise<void>;
export declare function createTask(req: Request, res: Response): Promise<void>;
export declare function updateTask(req: Request, res: Response): Promise<void>;
export declare function deleteTask(req: Request, res: Response): Promise<void>;
export declare function acceptTask(req: Request, res: Response): Promise<void>;
export declare function completeTask(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-tasks.controller.d.ts.map