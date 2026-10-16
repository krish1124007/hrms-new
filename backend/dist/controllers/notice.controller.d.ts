import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createNoticeSchema: z.ZodObject<{
    title: z.ZodString;
    content: z.ZodString;
    priority: z.ZodDefault<z.ZodEnum<["normal", "important", "urgent"]>>;
    /** Restrict visibility to these departments. Empty array = all employees. */
    departments: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    expiresAt: z.ZodOptional<z.ZodDate>;
    isPinned: z.ZodDefault<z.ZodBoolean>;
    attachments: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodDefault<z.ZodNumber>;
        mimeType: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        name: string;
        size: number;
        mimeType: string;
    }, {
        url: string;
        name: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    isPinned: boolean;
    departments: string[];
    attachments: {
        url: string;
        name: string;
        size: number;
        mimeType: string;
    }[];
    title: string;
    priority: "urgent" | "normal" | "important";
    content: string;
    expiresAt?: Date | undefined;
}, {
    title: string;
    content: string;
    isPinned?: boolean | undefined;
    expiresAt?: Date | undefined;
    departments?: string[] | undefined;
    attachments?: {
        url: string;
        name: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }[] | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
}>;
export declare const updateNoticeSchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodEnum<["normal", "important", "urgent"]>>>;
    departments: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    expiresAt: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    isPinned: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    attachments: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        url: z.ZodString;
        size: z.ZodDefault<z.ZodNumber>;
        mimeType: z.ZodDefault<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        url: string;
        name: string;
        size: number;
        mimeType: string;
    }, {
        url: string;
        name: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    isPinned?: boolean | undefined;
    expiresAt?: Date | undefined;
    departments?: string[] | undefined;
    attachments?: {
        url: string;
        name: string;
        size: number;
        mimeType: string;
    }[] | undefined;
    title?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
    content?: string | undefined;
}, {
    isPinned?: boolean | undefined;
    expiresAt?: Date | undefined;
    departments?: string[] | undefined;
    attachments?: {
        url: string;
        name: string;
        size?: number | undefined;
        mimeType?: string | undefined;
    }[] | undefined;
    title?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
    content?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["normal", "important", "urgent"]>>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    search?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
}, {
    limit?: number | undefined;
    page?: number | undefined;
    search?: string | undefined;
    priority?: "urgent" | "normal" | "important" | undefined;
}>;
export declare function listNotices(req: Request, res: Response): Promise<void>;
export declare function createNotice(req: Request, res: Response): Promise<void>;
export declare function getNotice(req: Request, res: Response): Promise<void>;
export declare function updateNotice(req: Request, res: Response): Promise<void>;
export declare function deleteNotice(req: Request, res: Response): Promise<void>;
export declare function acknowledgeNotice(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=notice.controller.d.ts.map