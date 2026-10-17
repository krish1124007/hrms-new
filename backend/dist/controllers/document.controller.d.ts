import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const updateDocumentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    folder: z.ZodOptional<z.ZodString>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    category: z.ZodOptional<z.ZodString>;
    accessLevel: z.ZodOptional<z.ZodEnum<["private", "department", "all"]>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    folder?: string | undefined;
    accessLevel?: "department" | "private" | "all" | undefined;
}, {
    name?: string | undefined;
    tags?: string[] | undefined;
    category?: string | undefined;
    folder?: string | undefined;
    accessLevel?: "department" | "private" | "all" | undefined;
}>;
export declare const listDocumentsQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    folder: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
    folder?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    folder?: string | undefined;
}>;
export declare function listDocuments(req: Request, res: Response): Promise<void>;
/**
 * Distinct folder paths in the document collection — used to render a
 * folder tree on the frontend without hardcoding it.
 */
export declare function listFolders(req: Request, res: Response): Promise<void>;
/**
 * Multipart upload entry point. Expects `multer.single('file')` middleware
 * to have populated `req.file`. Optional fields: folder, tags (CSV),
 * category, accessLevel.
 */
export declare function uploadDocument(req: Request, res: Response): Promise<void>;
export declare function getDocument(req: Request, res: Response): Promise<void>;
export declare function updateDocument(req: Request, res: Response): Promise<void>;
export declare function deleteDocument(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=document.controller.d.ts.map