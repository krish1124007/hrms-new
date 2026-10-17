import type { Request, Response } from 'express';
import { z } from 'zod';
/** GET /api/v1/disciplinary/me — actions against the calling employee. Auth-only. */
export declare function myActions(_req: Request, res: Response): Promise<void>;
export declare const createSchema: z.ZodObject<{
    employee: z.ZodString;
    type: z.ZodEnum<["verbal_warning", "written_warning", "final_warning", "pip", "suspension", "termination", "other"]>;
    severity: z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    title: z.ZodString;
    description: z.ZodString;
    incidentDate: z.ZodOptional<z.ZodDate>;
    pipStartDate: z.ZodOptional<z.ZodDate>;
    pipEndDate: z.ZodOptional<z.ZodDate>;
    pipGoals: z.ZodOptional<z.ZodString>;
    confidential: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination";
    description: string;
    title: string;
    employee: string;
    severity: "low" | "medium" | "high" | "critical";
    confidential: boolean;
    incidentDate?: Date | undefined;
    pipStartDate?: Date | undefined;
    pipEndDate?: Date | undefined;
    pipGoals?: string | undefined;
}, {
    type: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination";
    description: string;
    title: string;
    employee: string;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
    incidentDate?: Date | undefined;
    pipStartDate?: Date | undefined;
    pipEndDate?: Date | undefined;
    pipGoals?: string | undefined;
    confidential?: boolean | undefined;
}>;
export declare const updateSchema: z.ZodObject<{
    employee: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["verbal_warning", "written_warning", "final_warning", "pip", "suspension", "termination", "other"]>>;
    severity: z.ZodOptional<z.ZodDefault<z.ZodEnum<["low", "medium", "high", "critical"]>>>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    incidentDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    pipStartDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    pipEndDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    pipGoals: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    confidential: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    type?: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    employee?: string | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
    incidentDate?: Date | undefined;
    pipStartDate?: Date | undefined;
    pipEndDate?: Date | undefined;
    pipGoals?: string | undefined;
    confidential?: boolean | undefined;
}, {
    type?: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    employee?: string | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
    incidentDate?: Date | undefined;
    pipStartDate?: Date | undefined;
    pipEndDate?: Date | undefined;
    pipGoals?: string | undefined;
    confidential?: boolean | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["open", "acknowledged", "in_progress", "escalated", "resolved", "failed", "cancelled"]>>;
    type: z.ZodOptional<z.ZodEnum<["verbal_warning", "written_warning", "final_warning", "pip", "suspension", "termination", "other"]>>;
    severity: z.ZodOptional<z.ZodEnum<["low", "medium", "high", "critical"]>>;
    employee: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "cancelled" | "in_progress" | "failed" | "open" | "acknowledged" | "escalated" | "resolved" | undefined;
    sort?: string | undefined;
    type?: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination" | undefined;
    search?: string | undefined;
    employee?: string | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
}, {
    status?: "cancelled" | "in_progress" | "failed" | "open" | "acknowledged" | "escalated" | "resolved" | undefined;
    sort?: string | undefined;
    type?: "other" | "verbal_warning" | "written_warning" | "final_warning" | "pip" | "suspension" | "termination" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    employee?: string | undefined;
    severity?: "low" | "medium" | "high" | "critical" | undefined;
}>;
export declare const acknowledgeSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    notes?: string | undefined;
}, {
    notes?: string | undefined;
}>;
export declare const resolveSchema: z.ZodObject<{
    outcome: z.ZodEnum<["resolved", "failed"]>;
    notes: z.ZodString;
}, "strip", z.ZodTypeAny, {
    outcome: "failed" | "resolved";
    notes: string;
}, {
    outcome: "failed" | "resolved";
    notes: string;
}>;
export declare const escalateSchema: z.ZodObject<{
    escalatedTo: z.ZodString;
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
    escalatedTo: string;
}, {
    reason: string;
    escalatedTo: string;
}>;
export declare const cancelSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>;
export declare const addCommentSchema: z.ZodObject<{
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
}, {
    text: string;
}>;
export declare const addAttachmentSchema: z.ZodObject<{
    name: z.ZodString;
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    url: string;
}, {
    name: string;
    url: string;
}>;
/** GET /api/v1/disciplinary */
export declare function list(req: Request, res: Response): Promise<void>;
/** GET /api/v1/disciplinary/stats */
export declare function stats(_req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary */
export declare function create(req: Request, res: Response): Promise<void>;
/** GET /api/v1/disciplinary/:id */
export declare function get(req: Request, res: Response): Promise<void>;
/** PATCH /api/v1/disciplinary/:id */
export declare function update(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/disciplinary/:id */
export declare function remove(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/acknowledge */
export declare function acknowledge(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/resolve */
export declare function resolve(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/escalate */
export declare function escalate(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/cancel */
export declare function cancel(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/comments */
export declare function addComment(req: Request, res: Response): Promise<void>;
/** POST /api/v1/disciplinary/:id/attachments */
export declare function addAttachment(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/disciplinary/:id/attachments/:attId */
export declare function removeAttachment(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=disciplinary.controller.d.ts.map