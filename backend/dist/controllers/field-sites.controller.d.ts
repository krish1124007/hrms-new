import type { Request, Response, NextFunction } from 'express';
import type { FileFilterCallback } from 'multer';
import { z } from 'zod';
export { createSiteSchema } from '../services/field-sites.service.js';
/** The creator may edit their site for this long after creating it. */
export declare const CREATOR_EDIT_WINDOW_MS: number;
/** Most pins one map request returns. */
export declare const SITES_MAP_LIMIT = 500;
/** Most data rows one import takes. */
export declare const IMPORT_MAX_ROWS = 2000;
export declare const listQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    near: z.ZodOptional<z.ZodEffects<z.ZodString, {
        lat: number;
        lng: number;
    }, string>>;
    radiusKm: z.ZodOptional<z.ZodNumber>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    type?: string | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
    near?: {
        lat: number;
        lng: number;
    } | undefined;
    radiusKm?: number | undefined;
}, {
    type?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    assignedTo?: string | undefined;
    near?: string | undefined;
    radiusKm?: number | undefined;
}>;
export declare const mapQuerySchema: z.ZodObject<{
    bbox: z.ZodOptional<z.ZodEffects<z.ZodString, {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
    }, string>>;
}, "strip", z.ZodTypeAny, {
    bbox?: {
        minLng: number;
        minLat: number;
        maxLng: number;
        maxLat: number;
    } | undefined;
}, {
    bbox?: string | undefined;
}>;
/** `null` clears an optional text field or the photo. `assignedTo` (replaces the list) is for field managers. */
export declare const updateSiteSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodString>;
    location: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
        accuracy: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }, {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    }>>;
    radiusM: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodNullable<z.ZodUnion<[z.ZodObject<{
        line1: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        pincode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }, {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }>, z.ZodEffects<z.ZodString, {
        line1: string;
    }, string>]>>>;
    contactName: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    contactPhone: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    notes: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    photo: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    assignedTo: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    type?: string | undefined;
    name?: string | undefined;
    assignedTo?: string[] | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | {
        line1: string;
    } | null | undefined;
    photo?: string | null | undefined;
    notes?: string | null | undefined;
    radiusM?: number | undefined;
    contactName?: string | null | undefined;
    contactPhone?: string | null | undefined;
}, {
    type?: string | undefined;
    name?: string | undefined;
    assignedTo?: string[] | undefined;
    location?: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    } | undefined;
    address?: string | {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | null | undefined;
    photo?: string | null | undefined;
    notes?: string | null | undefined;
    radiusM?: number | undefined;
    contactName?: string | null | undefined;
    contactPhone?: string | null | undefined;
}>;
/**
 * GET /field/sites — paginated, by name; with `near=lat,lng` nearest first,
 * each with `distanceM` (within `radiusKm` when given).
 */
export declare function listSites(req: Request, res: Response): Promise<void>;
/**
 * GET /field/sites/map?bbox= — located sites inside the box (all without
 * `bbox`), by name, at most 500: `{ _id, name, type, location, radiusM,
 * lastVisitAt }`; `truncated` says whether more exist.
 */
export declare function sitesMap(req: Request, res: Response): Promise<void>;
/** GET /field/sites/:id — the site and its latest visits the caller may see. */
export declare function getSite(req: Request, res: Response): Promise<void>;
/**
 * POST /field/sites — pin a site (any field employee). Idempotent by
 * `clientRef`: a replay answers 200 with the stored site. `createdVia` is
 * `mobile_pin` when the request carries a `clientRef` (the app always does),
 * `web` otherwise.
 */
export declare function createSite(req: Request, res: Response): Promise<void>;
/** PATCH /field/sites/:id — the creator within 24 h, or a field manager. */
export declare function updateSite(req: Request, res: Response): Promise<void>;
/** DELETE /field/sites/:id (field managers) — soft delete; visits keep pointing at it. */
export declare function deleteSite(req: Request, res: Response): Promise<void>;
/** multer filter: spreadsheets only. */
export declare function sheetFileFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void;
/** Maps multer's own errors onto 400s. */
export declare function importUploadErrors(err: unknown, _req: Request, _res: Response, next: NextFunction): void;
/**
 * POST /field/sites/import (multipart `file`: .xlsx/.xls/.csv) — columns Name,
 * Type, Address, City, State, Pincode, Latitude, Longitude, Radius, Contact
 * name, Contact phone, Assigned employee IDs (employee codes, comma
 * separated). A row whose name matches one existing site (any case) updates
 * it; otherwise a site is created. Bad rows are skipped and reported by their
 * spreadsheet row number → `{ created, updated, errors: [{ row, message }] }`.
 */
export declare function importSites(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-sites.controller.d.ts.map