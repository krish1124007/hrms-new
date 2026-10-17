import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createSchema: z.ZodObject<{
    employee: z.ZodOptional<z.ZodString>;
    date: z.ZodDate;
    hours: z.ZodNumber;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: Date;
    reason: string;
    hours: number;
    employee?: string | undefined;
}, {
    date: Date;
    reason: string;
    hours: number;
    employee?: string | undefined;
}>;
export declare const updateSchema: z.ZodObject<{
    date: z.ZodOptional<z.ZodDate>;
    hours: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    date?: Date | undefined;
    reason?: string | undefined;
    hours?: number | undefined;
}, {
    date?: Date | undefined;
    reason?: string | undefined;
    hours?: number | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["pending", "approved", "rejected", "cancelled"]>>;
    employee: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "pending" | "approved" | "rejected" | "cancelled" | undefined;
    sort?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    employee?: string | undefined;
}, {
    status?: "pending" | "approved" | "rejected" | "cancelled" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    employee?: string | undefined;
}>;
export declare const approveSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    notes?: string | undefined;
}, {
    notes?: string | undefined;
}>;
export declare const rejectSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
/** GET /api/v1/overtime */
export declare function list(req: Request, res: Response): Promise<void>;
/** GET /api/v1/overtime/me */
export declare function listMine(req: Request, res: Response): Promise<void>;
/** GET /api/v1/overtime/stats */
export declare function stats(_req: Request, res: Response): Promise<void>;
/** POST /api/v1/overtime */
export declare function create(req: Request, res: Response): Promise<void>;
/** GET /api/v1/overtime/:id */
export declare function get(req: Request, res: Response): Promise<void>;
/** PATCH /api/v1/overtime/:id */
export declare function update(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/overtime/:id — withdraw a pending request */
export declare function remove(req: Request, res: Response): Promise<void>;
/** POST /api/v1/overtime/:id/approve */
export declare function approve(req: Request, res: Response): Promise<void>;
/** POST /api/v1/overtime/:id/reject */
export declare function reject(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=overtime.controller.d.ts.map