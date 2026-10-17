import type { Request, Response } from 'express';
import { z } from 'zod';
/** GET /api/v1/hr-policies/published — all published policies. Auth-only, no perms. */
export declare function listPublished(_req: Request, res: Response): Promise<void>;
export declare const createSchema: z.ZodObject<{
    policyCode: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    category: z.ZodDefault<z.ZodEnum<["general", "code_of_conduct", "leave", "attendance", "compensation", "benefits", "safety", "security", "data_privacy", "remote_work", "travel", "expenses", "harassment", "grievance", "it", "other"]>>;
    summary: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    effectiveDate: z.ZodOptional<z.ZodDate>;
    reviewDueDate: z.ZodOptional<z.ZodDate>;
    mandatory: z.ZodDefault<z.ZodBoolean>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    title: string;
    tags: string[];
    category: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it";
    mandatory: boolean;
    content?: string | undefined;
    effectiveDate?: Date | undefined;
    policyCode?: string | undefined;
    summary?: string | undefined;
    reviewDueDate?: Date | undefined;
}, {
    title: string;
    content?: string | undefined;
    tags?: string[] | undefined;
    category?: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it" | undefined;
    effectiveDate?: Date | undefined;
    policyCode?: string | undefined;
    summary?: string | undefined;
    reviewDueDate?: Date | undefined;
    mandatory?: boolean | undefined;
}>;
export declare const updateSchema: z.ZodObject<{
    policyCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodDefault<z.ZodEnum<["general", "code_of_conduct", "leave", "attendance", "compensation", "benefits", "safety", "security", "data_privacy", "remote_work", "travel", "expenses", "harassment", "grievance", "it", "other"]>>>;
    summary: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    content: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    effectiveDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    reviewDueDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    mandatory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    tags: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
} & {
    changeNotes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    title?: string | undefined;
    content?: string | undefined;
    tags?: string[] | undefined;
    category?: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it" | undefined;
    changeNotes?: string | undefined;
    effectiveDate?: Date | undefined;
    policyCode?: string | undefined;
    summary?: string | undefined;
    reviewDueDate?: Date | undefined;
    mandatory?: boolean | undefined;
}, {
    title?: string | undefined;
    content?: string | undefined;
    tags?: string[] | undefined;
    category?: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it" | undefined;
    changeNotes?: string | undefined;
    effectiveDate?: Date | undefined;
    policyCode?: string | undefined;
    summary?: string | undefined;
    reviewDueDate?: Date | undefined;
    mandatory?: boolean | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["general", "code_of_conduct", "leave", "attendance", "compensation", "benefits", "safety", "security", "data_privacy", "remote_work", "travel", "expenses", "harassment", "grievance", "it", "other"]>>;
    status: z.ZodOptional<z.ZodEnum<["draft", "published", "archived"]>>;
    mandatory: z.ZodOptional<z.ZodEnum<["true", "false"]>>;
    tag: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "draft" | "published" | "archived" | undefined;
    sort?: string | undefined;
    search?: string | undefined;
    category?: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it" | undefined;
    mandatory?: "true" | "false" | undefined;
    tag?: string | undefined;
}, {
    status?: "draft" | "published" | "archived" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    category?: "security" | "attendance" | "expenses" | "other" | "general" | "code_of_conduct" | "leave" | "compensation" | "benefits" | "safety" | "data_privacy" | "remote_work" | "travel" | "harassment" | "grievance" | "it" | undefined;
    mandatory?: "true" | "false" | undefined;
    tag?: string | undefined;
}>;
export declare const publishSchema: z.ZodObject<{
    effectiveDate: z.ZodOptional<z.ZodDate>;
    changeNotes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    changeNotes?: string | undefined;
    effectiveDate?: Date | undefined;
}, {
    changeNotes?: string | undefined;
    effectiveDate?: Date | undefined;
}>;
export declare const acknowledgeSchema: z.ZodObject<{
    employee: z.ZodOptional<z.ZodString>;
    comment: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    comment?: string | undefined;
    employee?: string | undefined;
}, {
    comment?: string | undefined;
    employee?: string | undefined;
}>;
/** GET /api/v1/hr-policies */
export declare function list(req: Request, res: Response): Promise<void>;
/** GET /api/v1/hr-policies/stats */
export declare function stats(_req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies */
export declare function create(req: Request, res: Response): Promise<void>;
/** GET /api/v1/hr-policies/:id */
export declare function get(req: Request, res: Response): Promise<void>;
/** PATCH /api/v1/hr-policies/:id */
export declare function update(req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies/:id/publish */
export declare function publish(req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies/:id/archive */
export declare function archive(req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies/:id/restore */
export declare function restore(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/hr-policies/:id */
export declare function remove(req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies/:id/acknowledge */
export declare function acknowledge(req: Request, res: Response): Promise<void>;
/** GET /api/v1/hr-policies/:id/acknowledgements */
export declare function listAcknowledgements(req: Request, res: Response): Promise<void>;
/** POST /api/v1/hr-policies/:id/attachments — upload a PDF and attach it. */
export declare function uploadAttachment(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/hr-policies/:id/attachments/:attachmentId — remove an attachment. */
export declare function deleteAttachment(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=hr-policies.controller.d.ts.map