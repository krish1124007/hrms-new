import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createDesignationSchema: z.ZodObject<{
    name: z.ZodString;
    department: z.ZodOptional<z.ZodString>;
    level: z.ZodDefault<z.ZodNumber>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    level: number;
    name: string;
    description?: string | undefined;
    department?: string | undefined;
}, {
    name: string;
    level?: number | undefined;
    description?: string | undefined;
    department?: string | undefined;
}>;
export declare const updateDesignationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    level: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    level?: number | undefined;
    name?: string | undefined;
    description?: string | undefined;
    department?: string | undefined;
}, {
    level?: number | undefined;
    name?: string | undefined;
    description?: string | undefined;
    department?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    department: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    search?: string | undefined;
    department?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    search?: string | undefined;
    department?: string | undefined;
}>;
export declare function listDesignations(req: Request, res: Response): Promise<void>;
export declare function createDesignation(req: Request, res: Response): Promise<void>;
export declare function getDesignation(req: Request, res: Response): Promise<void>;
export declare function updateDesignation(req: Request, res: Response): Promise<void>;
export declare function deleteDesignation(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=designations.controller.d.ts.map