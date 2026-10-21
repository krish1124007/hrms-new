import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createProductSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    sku: z.ZodString;
    category: z.ZodString;
    unit: z.ZodDefault<z.ZodString>;
    price: z.ZodNumber;
    gstRate: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    /** The mobile app's name for gstRate. */
    taxRate: z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>;
    hsnCode: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    category: string;
    isActive: boolean;
    unit: string;
    sku: string;
    price: number;
    description?: string | undefined;
    hsnCode?: string | undefined;
    gstRate?: number | undefined;
    taxRate?: number | undefined;
}, {
    name: string;
    category: string;
    sku: string;
    price: number;
    description?: string | undefined;
    isActive?: boolean | undefined;
    unit?: string | undefined;
    hsnCode?: string | undefined;
    gstRate?: number | undefined;
    taxRate?: number | undefined;
}>, {
    gstRate: number;
    name: string;
    category: string;
    isActive: boolean;
    unit: string;
    sku: string;
    price: number;
    description?: string | undefined;
    hsnCode?: string | undefined;
}, {
    name: string;
    category: string;
    sku: string;
    price: number;
    description?: string | undefined;
    isActive?: boolean | undefined;
    unit?: string | undefined;
    hsnCode?: string | undefined;
    gstRate?: number | undefined;
    taxRate?: number | undefined;
}>;
/** A partial product; `null` clears the HSN code or the description (name, SKU, category, price stay required). */
export declare const updateProductSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    sku: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    unit: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    price: z.ZodOptional<z.ZodNumber>;
    gstRate: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>>;
    taxRate: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodNumber, number, number>>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
} & {
    hsnCode: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    category?: string | undefined;
    isActive?: boolean | undefined;
    unit?: string | undefined;
    sku?: string | undefined;
    hsnCode?: string | null | undefined;
    gstRate?: number | undefined;
    price?: number | undefined;
    taxRate?: number | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    category?: string | undefined;
    isActive?: boolean | undefined;
    unit?: string | undefined;
    sku?: string | undefined;
    hsnCode?: string | null | undefined;
    gstRate?: number | undefined;
    price?: number | undefined;
    taxRate?: number | undefined;
}>, Record<string, unknown>, {
    name?: string | undefined;
    description?: string | null | undefined;
    category?: string | undefined;
    isActive?: boolean | undefined;
    unit?: string | undefined;
    sku?: string | undefined;
    hsnCode?: string | null | undefined;
    gstRate?: number | undefined;
    price?: number | undefined;
    taxRate?: number | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    /** `true` (default) active only, `false` inactive only, `all` both. */
    active: z.ZodDefault<z.ZodEnum<["true", "false", "all"]>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    active: "true" | "false" | "all";
    sort?: string | undefined;
    search?: string | undefined;
    category?: string | undefined;
}, {
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    active?: "true" | "false" | "all" | undefined;
    category?: string | undefined;
}>;
export declare function listProducts(req: Request, res: Response): Promise<void>;
/** Distinct categories of active products, sorted. */
export declare function listCategories(_req: Request, res: Response): Promise<void>;
export declare function getProduct(req: Request, res: Response): Promise<void>;
export declare function createProduct(req: Request, res: Response): Promise<void>;
export declare function updateProduct(req: Request, res: Response): Promise<void>;
export declare function deleteProduct(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-products.controller.d.ts.map