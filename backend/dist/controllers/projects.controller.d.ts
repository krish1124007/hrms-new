import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const memberSchema: z.ZodObject<{
    userId: z.ZodString;
    role: z.ZodDefault<z.ZodEnum<["manager", "member", "viewer"]>>;
}, "strip", z.ZodTypeAny, {
    userId: string;
    role: "manager" | "member" | "viewer";
}, {
    userId: string;
    role?: "manager" | "member" | "viewer" | undefined;
}>;
export declare const createProjectSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    client: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    startDate: z.ZodOptional<z.ZodDate>;
    endDate: z.ZodOptional<z.ZodDate>;
    estimatedHours: z.ZodOptional<z.ZodNumber>;
    budget: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["not_started", "in_progress", "on_hold", "completed", "cancelled"]>>;
    priority: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    members: z.ZodOptional<z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        role: z.ZodDefault<z.ZodEnum<["manager", "member", "viewer"]>>;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        role: "manager" | "member" | "viewer";
    }, {
        userId: string;
        role?: "manager" | "member" | "viewer" | undefined;
    }>, "many">>;
    progress: z.ZodOptional<z.ZodNumber>;
    color: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    client?: string | undefined;
    color?: string | undefined;
    progress?: number | undefined;
    estimatedHours?: number | undefined;
    budget?: number | undefined;
    members?: {
        userId: string;
        role: "manager" | "member" | "viewer";
    }[] | undefined;
}, {
    code: string;
    name: string;
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    client?: string | undefined;
    color?: string | undefined;
    progress?: number | undefined;
    estimatedHours?: number | undefined;
    budget?: number | undefined;
    members?: {
        userId: string;
        role?: "manager" | "member" | "viewer" | undefined;
    }[] | undefined;
}>;
export declare const updateProjectSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    client: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    category: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    startDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    endDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    estimatedHours: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    budget: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<["not_started", "in_progress", "on_hold", "completed", "cancelled"]>>>;
    priority: z.ZodOptional<z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>>;
    members: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodObject<{
        userId: z.ZodString;
        role: z.ZodDefault<z.ZodEnum<["manager", "member", "viewer"]>>;
    }, "strip", z.ZodTypeAny, {
        userId: string;
        role: "manager" | "member" | "viewer";
    }, {
        userId: string;
        role?: "manager" | "member" | "viewer" | undefined;
    }>, "many">>>;
    progress: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    color: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    tags: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    code?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    client?: string | undefined;
    color?: string | undefined;
    progress?: number | undefined;
    estimatedHours?: number | undefined;
    budget?: number | undefined;
    members?: {
        userId: string;
        role: "manager" | "member" | "viewer";
    }[] | undefined;
}, {
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    code?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    startDate?: Date | undefined;
    endDate?: Date | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    priority?: "low" | "medium" | "high" | "critical" | undefined;
    client?: string | undefined;
    color?: string | undefined;
    progress?: number | undefined;
    estimatedHours?: number | undefined;
    budget?: number | undefined;
    members?: {
        userId: string;
        role?: "manager" | "member" | "viewer" | undefined;
    }[] | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["not_started", "in_progress", "on_hold", "completed", "cancelled"]>>;
    client: z.ZodOptional<z.ZodString>;
    member: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    sort?: string | undefined;
    search?: string | undefined;
    client?: string | undefined;
    member?: string | undefined;
}, {
    status?: "cancelled" | "completed" | "in_progress" | "not_started" | "on_hold" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    client?: string | undefined;
    member?: string | undefined;
}>;
export declare function listProjects(req: Request, res: Response): Promise<void>;
export declare function createProject(req: Request, res: Response): Promise<void>;
export declare function getProject(req: Request, res: Response): Promise<void>;
export declare function updateProject(req: Request, res: Response): Promise<void>;
export declare function deleteProject(req: Request, res: Response): Promise<void>;
export declare function getProjectDashboard(req: Request, res: Response): Promise<void>;
export declare function addMember(req: Request, res: Response): Promise<void>;
export declare function removeMember(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=projects.controller.d.ts.map