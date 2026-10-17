import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createDepartmentSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    head: z.ZodOptional<z.ZodString>;
    parentDepartment: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive"]>>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    status?: "active" | "inactive" | undefined;
    description?: string | undefined;
    head?: string | undefined;
    parentDepartment?: string | undefined;
}, {
    code: string;
    name: string;
    status?: "active" | "inactive" | undefined;
    description?: string | undefined;
    head?: string | undefined;
    parentDepartment?: string | undefined;
}>;
export declare const updateDepartmentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    head: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    parentDepartment: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<["active", "inactive"]>>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "inactive" | undefined;
    code?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    head?: string | undefined;
    parentDepartment?: string | undefined;
}, {
    status?: "active" | "inactive" | undefined;
    code?: string | undefined;
    name?: string | undefined;
    description?: string | undefined;
    head?: string | undefined;
    parentDepartment?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive"]>>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "active" | "inactive" | undefined;
    sort?: string | undefined;
    search?: string | undefined;
}, {
    status?: "active" | "inactive" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
export declare function listDepartments(req: Request, res: Response): Promise<void>;
export declare function getDepartmentTree(_req: Request, res: Response): Promise<void>;
export declare function createDepartment(req: Request, res: Response): Promise<void>;
export declare function getDepartment(req: Request, res: Response): Promise<void>;
export declare function updateDepartment(req: Request, res: Response): Promise<void>;
export declare function deleteDepartment(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=departments.controller.d.ts.map