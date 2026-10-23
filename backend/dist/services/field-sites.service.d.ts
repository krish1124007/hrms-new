/**
 * Sites: the shared pieces behind /field/sites and the visit engine's
 * "pin a new site at check-in" — the create input, the create itself
 * (idempotent by `clientRef`), who may see which site, the API shape, and
 * the visit counters a check-in bumps.
 */
import type { Request } from 'express';
import { Types } from 'mongoose';
import { z } from 'zod';
import { type IFieldSite, type SiteCreatedVia } from '../models/field-site.model.js';
import { type FieldScope } from '../lib/field-scope.js';
import { type FieldSettings } from './field-settings.service.js';
export declare const MIN_SITE_RADIUS_M = 10;
export declare const MAX_SITE_RADIUS_M = 5000;
export declare const latLngSchema: z.ZodEffects<z.ZodObject<{
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
}>;
/** `{ line1, city, state, pincode }`, or a single line (line1). */
export declare const addressInputSchema: z.ZodUnion<[z.ZodObject<{
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
}, string>]>;
/** The fields of a new site — POST /sites without `clientRef`, and a check-in's `newSite`. */
export declare const newSiteSchema: z.ZodObject<{
    capturedAt: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    type: z.ZodString;
    location: z.ZodEffects<z.ZodObject<{
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
    }>;
    radiusM: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
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
    }, string>]>>;
    contactName: z.ZodOptional<z.ZodString>;
    contactPhone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    /** Upload key from POST /field/uploads/photo. */
    photo: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
    location: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    };
    assignedTo?: string[] | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | {
        line1: string;
    } | undefined;
    photo?: string | undefined;
    notes?: string | undefined;
    radiusM?: number | undefined;
    contactName?: string | undefined;
    contactPhone?: string | undefined;
    capturedAt?: string | undefined;
}, {
    type: string;
    name: string;
    location: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    };
    assignedTo?: string[] | undefined;
    address?: string | {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    photo?: string | undefined;
    notes?: string | undefined;
    radiusM?: number | undefined;
    contactName?: string | undefined;
    contactPhone?: string | undefined;
    capturedAt?: string | undefined;
}>;
export type NewSiteInput = z.infer<typeof newSiteSchema>;
/** POST /field/sites. `clientRef` (UUID) makes the create idempotent; the mobile app always sends it. */
export declare const createSiteSchema: z.ZodObject<{
    capturedAt: z.ZodOptional<z.ZodString>;
    name: z.ZodString;
    type: z.ZodString;
    location: z.ZodEffects<z.ZodObject<{
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
    }>;
    radiusM: z.ZodOptional<z.ZodNumber>;
    address: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
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
    }, string>]>>;
    contactName: z.ZodOptional<z.ZodString>;
    contactPhone: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
    /** Upload key from POST /field/uploads/photo. */
    photo: z.ZodOptional<z.ZodString>;
    assignedTo: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
} & {
    clientRef: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: string;
    name: string;
    location: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    };
    assignedTo?: string[] | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | {
        line1: string;
    } | undefined;
    photo?: string | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    radiusM?: number | undefined;
    contactName?: string | undefined;
    contactPhone?: string | undefined;
    capturedAt?: string | undefined;
}, {
    type: string;
    name: string;
    location: {
        lat: number;
        lng: number;
        accuracy?: number | undefined;
    };
    assignedTo?: string[] | undefined;
    address?: string | {
        state?: string | undefined;
        line1?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    photo?: string | undefined;
    notes?: string | undefined;
    clientRef?: string | undefined;
    radiusM?: number | undefined;
    contactName?: string | undefined;
    contactPhone?: string | undefined;
    capturedAt?: string | undefined;
}>;
/** `[lng, lat]` → `{ lat, lng }`, or null. */
export declare function siteLatLng(location: unknown): {
    lat: number;
    lng: number;
} | null;
export interface SiteJson {
    _id: string;
    clientRef: string | null;
    name: string;
    type: string;
    address: {
        line1: string;
        city: string;
        state: string;
        pincode: string;
    };
    location: {
        lat: number;
        lng: number;
    } | null;
    radiusM: number;
    contactName: string;
    contactPhone: string;
    notes: string;
    photoUrl?: string;
    assignedTo: Array<{
        _id: string;
        firstName: string;
        lastName: string;
        employeeId: string;
    }>;
    createdBy: {
        _id: string;
        firstName: string;
        lastName: string;
    } | null;
    createdVia: SiteCreatedVia;
    lastVisitAt: Date | null;
    visitCount: number;
    distanceM?: number;
    createdAt?: Date;
    updatedAt?: Date;
}
/**
 * The API shape of a site (a lean object or a document) with `assignedTo`
 * (`firstName lastName employeeId`) and `createdBy` (`firstName lastName`)
 * populated; unpopulated references are left out.
 */
export declare function serializeSite(raw: any): SiteJson;
export declare const SITE_POPULATE: {
    path: string;
    select: string;
}[];
/**
 * Sites the caller may see: a field manager every site; anyone else the
 * sites assigned to them or their direct reports, and the ones they created.
 */
export declare function siteScopeFilter(req: Request, scope: FieldScope): Record<string, unknown>;
/** True when the caller may see `site` (by `siteScopeFilter`'s rule). */
export declare function canSeeSite(req: Request, scope: FieldScope, site: Pick<IFieldSite, 'assignedTo' | 'createdBy'>): boolean;
/** A live site by id (`withDeleted`: a deleted one too), or 404. */
export declare function loadSite(id: string, opts?: {
    withDeleted?: boolean;
}): Promise<import("mongoose").Document<unknown, {}, IFieldSite, {}, {}> & IFieldSite & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}>;
/** 403 unless the caller may see `site`. */
export declare function assertSiteRead(req: Request, site: Pick<IFieldSite, 'assignedTo' | 'createdBy'>): Promise<void>;
/** The settings' spelling of `type`, or 400 `INVALID_SITE_TYPE`. */
export declare function canonicalSiteType(type: string, settings: FieldSettings): string;
/**
 * The settings' spelling of `type`; an unknown type (an offline pin made
 * before HR changed the types) becomes "Other" — the settings' type of that
 * name, else their last type.
 */
export declare function siteTypeOrOther(type: string, settings: FieldSettings): string;
/**
 * The employees a site may be assigned to by this caller: existing employees,
 * and — unless the caller manages the field — only themselves or their direct
 * reports (403 otherwise).
 */
export declare function checkAssignees(scope: FieldScope, ids: readonly string[]): Promise<Types.ObjectId[]>;
/**
 * Create a site for the caller (idempotent by `clientRef`, per creator).
 * The creator, when they have an employee record, is always assigned.
 * Without an address, the pin is reverse-geocoded (when Google is set up).
 * A replay returns the stored site with `created: false`. `lenientType` (an
 * offline pin): an unknown type becomes "Other" instead of 400.
 */
export declare function createFieldSite(req: Request, input: NewSiteInput, opts: {
    clientRef?: string;
    createdVia: SiteCreatedVia;
    lenientType?: boolean;
}): Promise<{
    site: IFieldSite;
    created: boolean;
}>;
/** A check-in at `siteId` happened at `at`: one more visit, and `lastVisitAt` moves forward (never back). */
export declare function recordSiteVisit(siteId: unknown, at: Date): Promise<void>;
//# sourceMappingURL=field-sites.service.d.ts.map