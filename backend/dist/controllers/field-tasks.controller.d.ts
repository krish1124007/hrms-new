import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createTaskSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodEffects<z.ZodString, string, string>;
    siteId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
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
    assignedTo: string;
    priority: "low" | "medium" | "high" | "urgent";
    description?: string | undefined;
    siteId?: string | undefined;
    dueDate?: Date | undefined;
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
    siteId?: string | undefined;
    dueDate?: Date | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
}>;
/** `null` clears an optional field: the description, site, location or due date (never the assignee). */
export declare const updateTaskSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignedTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    siteId: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
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
    siteId?: string | null | undefined;
    dueDate?: Date | null | undefined;
    title?: string | undefined;
    assignedTo?: string | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | null | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
}, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    description?: string | null | undefined;
    siteId?: string | null | undefined;
    dueDate?: Date | null | undefined;
    title?: string | undefined;
    assignedTo?: string | undefined;
    location?: {
        address?: string | undefined;
        lat?: number | undefined;
        lng?: number | undefined;
    } | null | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
}>;
/**
 * Completion, offline-safe: `clientRef` (a replay answers 200 with the task)
 * and `capturedAt` (the device time, stored as `completedAt`). Photos as
 * upload keys in `photoKeys`; `completionPhotos` / `photo` / `notes` are older
 * names still accepted.
 */
export declare const completeSchema: z.ZodObject<{
    clientRef: z.ZodOptional<z.ZodString>;
    capturedAt: z.ZodOptional<z.ZodString>;
    photoKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    completionPhotos: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    completionNotes: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    photo: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    photo?: string | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
    photoKeys?: string[] | undefined;
}, {
    photo?: string | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    capturedAt?: string | undefined;
    completionPhotos?: string[] | undefined;
    completionNotes?: string | undefined;
    photoKeys?: string[] | undefined;
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
    assignedTo?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
}, {
    status?: "cancelled" | "completed" | "new" | "accepted" | "in_progress" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    assignedTo?: string | undefined;
    priority?: "low" | "medium" | "high" | "urgent" | undefined;
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
/**
 * PATCH /field/tasks/:id/complete — the assignee (or a field manager) closes
 * the task with notes and proof photos. Idempotent by `clientRef`. The
 * assignee's manager and the task's creator are told.
 */
export declare function completeTask(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-tasks.controller.d.ts.map