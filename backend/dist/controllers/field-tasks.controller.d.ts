import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTaskSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodEffects<z.ZodString, string, string>;
    clientId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
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
    status: z.ZodDefault<z.ZodEnum<["new", "accepted", "in_progress"]>>;
    dueDate: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    status: "new" | "accepted" | "in_progress";
    title: string;
    priority: "low" | "medium" | "high" | "urgent";
    assignedTo: string;
    description?: string | undefined;
    dueDate?: Date | undefined;
    clientId?: string | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
}, {
    title: string;
    assignedTo: string;
    status?: "new" | "accepted" | "in_progress" | undefined;
    description?: string | undefined;
    dueDate?: Date | undefined;
    clientId?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
}>;
/** `null` clears an optional field: the description, client, location or due date (never the assignee). */
export declare const updateTaskSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignedTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    clientId: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    location: z.ZodOptional<z.ZodNullable<z.ZodObject<{
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
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "urgent"]>>;
    status: z.ZodOptional<z.ZodEnum<["new", "accepted", "in_progress", "completed", "cancelled"]>>;
    dueDate: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    description?: string | null | undefined;
    dueDate?: Date | null | undefined;
    title?: string | undefined;
    clientId?: string | null | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | null | undefined;
    assignedTo?: string | undefined;
}, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    description?: string | null | undefined;
    dueDate?: Date | null | undefined;
    title?: string | undefined;
    clientId?: string | null | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | null | undefined;
    assignedTo?: string | undefined;
}>;
/** `notes`/`photo` are the mobile app's names for `completionNotes`/`completionPhotos`. */
export declare const completeSchema: z.ZodObject<{
    completionPhotos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    completionNotes: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    photo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    photo?: string | undefined;
    notes?: string | undefined;
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
}, {
    photo?: string | undefined;
    notes?: string | undefined;
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    assignedTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    status: z.ZodOptional<z.ZodEnum<["new", "accepted", "in_progress", "completed", "cancelled"]>>;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "urgent"]>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    sort?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    assignedTo?: string | undefined;
}, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
    assignedTo?: string | undefined;
}>;
export declare const myQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEnum<["new", "accepted", "in_progress", "completed", "cancelled"]>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
}, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare function listTasks(req: Request, res: Response): Promise<void>;
export declare function myTasks(req: Request, res: Response): Promise<void>;
/** The tasks of the reps the caller can see (field managers: everyone), paginated. */
export declare function teamTasks(req: Request, res: Response): Promise<void>;
export declare function getTask(req: Request, res: Response): Promise<void>;
export declare function createTask(req: Request, res: Response): Promise<void>;
/** Managers edit anything (reassigning notifies the new assignee); the assignee only moves the status along. */
export declare function updateTask(req: Request, res: Response): Promise<void>;
export declare function deleteTask(req: Request, res: Response): Promise<void>;
export declare function acceptTask(req: Request, res: Response): Promise<void>;
export declare function completeTask(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-tasks.controller.d.ts.map