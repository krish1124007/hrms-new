import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createAssetSchema: z.ZodObject<{
    name: z.ZodString;
    assetCode: z.ZodOptional<z.ZodString>;
    category: z.ZodDefault<z.ZodEnum<["laptop", "desktop", "mobile", "tablet", "monitor", "peripheral", "furniture", "vehicle", "tool", "other"]>>;
    status: z.ZodOptional<z.ZodEnum<["available", "assigned", "maintenance", "retired", "lost"]>>;
    condition: z.ZodDefault<z.ZodEnum<["new", "good", "fair", "poor", "damaged"]>>;
    serialNumber: z.ZodOptional<z.ZodString>;
    manufacturer: z.ZodOptional<z.ZodString>;
    modelNumber: z.ZodOptional<z.ZodString>;
    purchaseDate: z.ZodOptional<z.ZodDate>;
    purchasePrice: z.ZodOptional<z.ZodNumber>;
    currentValue: z.ZodOptional<z.ZodNumber>;
    warrantyExpiresAt: z.ZodOptional<z.ZodDate>;
    location: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
}, "strip", z.ZodTypeAny, {
    name: string;
    category: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other";
    condition: "new" | "good" | "fair" | "poor" | "damaged";
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    assetCode?: string | undefined;
    serialNumber?: string | undefined;
    manufacturer?: string | undefined;
    modelNumber?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    currentValue?: number | undefined;
    warrantyExpiresAt?: Date | undefined;
    location?: string | undefined;
    notes?: string | undefined;
    imageUrl?: string | undefined;
}, {
    name: string;
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    assetCode?: string | undefined;
    category?: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other" | undefined;
    condition?: "new" | "good" | "fair" | "poor" | "damaged" | undefined;
    serialNumber?: string | undefined;
    manufacturer?: string | undefined;
    modelNumber?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    currentValue?: number | undefined;
    warrantyExpiresAt?: Date | undefined;
    location?: string | undefined;
    notes?: string | undefined;
    imageUrl?: string | undefined;
}>;
export declare const updateAssetSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    assetCode: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodEnum<["laptop", "desktop", "mobile", "tablet", "monitor", "peripheral", "furniture", "vehicle", "tool", "other"]>>>;
    status: z.ZodOptional<z.ZodOptional<z.ZodEnum<["available", "assigned", "maintenance", "retired", "lost"]>>>;
    condition: z.ZodOptional<z.ZodDefault<z.ZodEnum<["new", "good", "fair", "poor", "damaged"]>>>;
    serialNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    manufacturer: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    modelNumber: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    purchaseDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    purchasePrice: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    currentValue: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    warrantyExpiresAt: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    location: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    imageUrl: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
}, "strip", z.ZodTypeAny, {
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    name?: string | undefined;
    assetCode?: string | undefined;
    category?: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other" | undefined;
    condition?: "new" | "good" | "fair" | "poor" | "damaged" | undefined;
    serialNumber?: string | undefined;
    manufacturer?: string | undefined;
    modelNumber?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    currentValue?: number | undefined;
    warrantyExpiresAt?: Date | undefined;
    location?: string | undefined;
    notes?: string | undefined;
    imageUrl?: string | undefined;
}, {
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    name?: string | undefined;
    assetCode?: string | undefined;
    category?: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other" | undefined;
    condition?: "new" | "good" | "fair" | "poor" | "damaged" | undefined;
    serialNumber?: string | undefined;
    manufacturer?: string | undefined;
    modelNumber?: string | undefined;
    purchaseDate?: Date | undefined;
    purchasePrice?: number | undefined;
    currentValue?: number | undefined;
    warrantyExpiresAt?: Date | undefined;
    location?: string | undefined;
    notes?: string | undefined;
    imageUrl?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodEnum<["laptop", "desktop", "mobile", "tablet", "monitor", "peripheral", "furniture", "vehicle", "tool", "other"]>>;
    status: z.ZodOptional<z.ZodEnum<["available", "assigned", "maintenance", "retired", "lost"]>>;
    assignedTo: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    category?: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other" | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    status?: "available" | "assigned" | "maintenance" | "retired" | "lost" | undefined;
    category?: "laptop" | "desktop" | "mobile" | "tablet" | "monitor" | "peripheral" | "furniture" | "vehicle" | "tool" | "other" | undefined;
    page?: number | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
}>;
export declare const assignSchema: z.ZodObject<{
    employee: z.ZodString;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    employee: string;
    notes?: string | undefined;
}, {
    employee: string;
    notes?: string | undefined;
}>;
export declare const unassignSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
    condition: z.ZodOptional<z.ZodEnum<["new", "good", "fair", "poor", "damaged"]>>;
}, "strip", z.ZodTypeAny, {
    condition?: "new" | "good" | "fair" | "poor" | "damaged" | undefined;
    notes?: string | undefined;
}, {
    condition?: "new" | "good" | "fair" | "poor" | "damaged" | undefined;
    notes?: string | undefined;
}>;
/** GET /api/v1/assets/me — assets currently assigned to the calling employee. Auth-only, no perms. */
export declare function myAssets(_req: Request, res: Response): Promise<void>;
/** GET /api/v1/assets */
export declare function listAssets(req: Request, res: Response): Promise<void>;
/** GET /api/v1/assets/stats */
export declare function assetStats(_req: Request, res: Response): Promise<void>;
/** POST /api/v1/assets */
export declare function createAsset(req: Request, res: Response): Promise<void>;
/** GET /api/v1/assets/:id */
export declare function getAsset(req: Request, res: Response): Promise<void>;
/** PATCH /api/v1/assets/:id */
export declare function updateAsset(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/assets/:id */
export declare function deleteAsset(req: Request, res: Response): Promise<void>;
/** POST /api/v1/assets/:id/assign */
export declare function assignAsset(req: Request, res: Response): Promise<void>;
/** POST /api/v1/assets/:id/unassign */
export declare function unassignAsset(req: Request, res: Response): Promise<void>;
/** POST /api/v1/assets/import — Bulk import assets from Excel / CSV or JSON */
export declare function importAssets(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=assets.controller.d.ts.map