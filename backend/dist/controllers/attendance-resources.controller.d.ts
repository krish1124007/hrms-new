import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createSiteSchema: z.ZodObject<{
    name: z.ZodString;
    address: z.ZodOptional<z.ZodString>;
    location: z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>;
    radius: z.ZodDefault<z.ZodNumber>;
    assignedEmployees: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    radius: number;
    isActive: boolean;
    location: {
        lat: number;
        lng: number;
    };
    assignedEmployees: string[];
    address?: string | undefined;
}, {
    name: string;
    location: {
        lat: number;
        lng: number;
    };
    radius?: number | undefined;
    address?: string | undefined;
    isActive?: boolean | undefined;
    assignedEmployees?: string[] | undefined;
}>;
export declare const updateSiteSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    address: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    location: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>;
    radius: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    assignedEmployees: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    radius?: number | undefined;
    address?: string | undefined;
    isActive?: boolean | undefined;
    location?: {
        lat: number;
        lng: number;
    } | undefined;
    assignedEmployees?: string[] | undefined;
}, {
    name?: string | undefined;
    radius?: number | undefined;
    address?: string | undefined;
    isActive?: boolean | undefined;
    location?: {
        lat: number;
        lng: number;
    } | undefined;
    assignedEmployees?: string[] | undefined;
}>;
export declare const listSchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
export declare function listSites(req: Request, res: Response): Promise<void>;
export declare function createSite(req: Request, res: Response): Promise<void>;
export declare function getSite(req: Request, res: Response): Promise<void>;
export declare function updateSite(req: Request, res: Response): Promise<void>;
export declare function deleteSite(req: Request, res: Response): Promise<void>;
export declare const assignEmployeesSchema: z.ZodObject<{
    employeeIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    employeeIds: string[];
}, {
    employeeIds: string[];
}>;
export declare function assignEmployees(req: Request, res: Response): Promise<void>;
export declare const createGeofenceSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    type: z.ZodEnum<["circle", "polygon"]>;
    center: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>;
    radius: z.ZodOptional<z.ZodNumber>;
    coordinates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>, "many">>;
    autoCheckIn: z.ZodDefault<z.ZodBoolean>;
    autoCheckOut: z.ZodDefault<z.ZodBoolean>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "circle" | "polygon";
    name: string;
    coordinates: {
        lat: number;
        lng: number;
    }[];
    isActive: boolean;
    autoCheckIn: boolean;
    autoCheckOut: boolean;
    radius?: number | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
}, {
    type: "circle" | "polygon";
    name: string;
    radius?: number | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    }[] | undefined;
    isActive?: boolean | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
    autoCheckIn?: boolean | undefined;
    autoCheckOut?: boolean | undefined;
}>, {
    type: "circle" | "polygon";
    name: string;
    coordinates: {
        lat: number;
        lng: number;
    }[];
    isActive: boolean;
    autoCheckIn: boolean;
    autoCheckOut: boolean;
    radius?: number | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
}, {
    type: "circle" | "polygon";
    name: string;
    radius?: number | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    }[] | undefined;
    isActive?: boolean | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
    autoCheckIn?: boolean | undefined;
    autoCheckOut?: boolean | undefined;
}>;
export declare const updateGeofenceSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["circle", "polygon"]>>;
    center: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>;
    radius: z.ZodOptional<z.ZodNumber>;
    coordinates: z.ZodOptional<z.ZodArray<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>, "many">>;
    autoCheckIn: z.ZodOptional<z.ZodBoolean>;
    autoCheckOut: z.ZodOptional<z.ZodBoolean>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type?: "circle" | "polygon" | undefined;
    name?: string | undefined;
    radius?: number | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    }[] | undefined;
    isActive?: boolean | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
    autoCheckIn?: boolean | undefined;
    autoCheckOut?: boolean | undefined;
}, {
    type?: "circle" | "polygon" | undefined;
    name?: string | undefined;
    radius?: number | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    }[] | undefined;
    isActive?: boolean | undefined;
    center?: {
        lat: number;
        lng: number;
    } | undefined;
    autoCheckIn?: boolean | undefined;
    autoCheckOut?: boolean | undefined;
}>;
export declare function listGeofences(req: Request, res: Response): Promise<void>;
export declare function createGeofence(req: Request, res: Response): Promise<void>;
export declare function getGeofence(req: Request, res: Response): Promise<void>;
export declare function updateGeofence(req: Request, res: Response): Promise<void>;
export declare function deleteGeofence(req: Request, res: Response): Promise<void>;
export declare const createQRSchema: z.ZodObject<{
    type: z.ZodDefault<z.ZodEnum<["static", "dynamic"]>>;
    locationId: z.ZodOptional<z.ZodString>;
    expiresAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    type: "static" | "dynamic";
    expiresAt?: Date | undefined;
    locationId?: string | undefined;
}, {
    type?: "static" | "dynamic" | undefined;
    expiresAt?: Date | undefined;
    locationId?: string | undefined;
}>;
export declare function listQRCodes(req: Request, res: Response): Promise<void>;
export declare function createQRCode(req: Request, res: Response): Promise<void>;
export declare function rotateDynamicQR(_req: Request, res: Response): Promise<void>;
export declare function deleteQRCode(req: Request, res: Response): Promise<void>;
export declare const createAllowedIPSchema: z.ZodEffects<z.ZodObject<{
    label: z.ZodString;
    ipAddress: z.ZodOptional<z.ZodString>;
    ipRangeStart: z.ZodOptional<z.ZodString>;
    ipRangeEnd: z.ZodOptional<z.ZodString>;
    locationId: z.ZodOptional<z.ZodString>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    label: string;
    isActive: boolean;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}, {
    label: string;
    isActive?: boolean | undefined;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}>, {
    label: string;
    isActive: boolean;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}, {
    label: string;
    isActive?: boolean | undefined;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}>;
export declare const updateAllowedIPSchema: z.ZodObject<{
    label: z.ZodOptional<z.ZodString>;
    ipAddress: z.ZodOptional<z.ZodString>;
    ipRangeStart: z.ZodOptional<z.ZodString>;
    ipRangeEnd: z.ZodOptional<z.ZodString>;
    locationId: z.ZodOptional<z.ZodString>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    label?: string | undefined;
    isActive?: boolean | undefined;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}, {
    label?: string | undefined;
    isActive?: boolean | undefined;
    locationId?: string | undefined;
    ipAddress?: string | undefined;
    ipRangeStart?: string | undefined;
    ipRangeEnd?: string | undefined;
}>;
export declare function listAllowedIPs(req: Request, res: Response): Promise<void>;
export declare function createAllowedIP(req: Request, res: Response): Promise<void>;
export declare function updateAllowedIP(req: Request, res: Response): Promise<void>;
export declare function deleteAllowedIP(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=attendance-resources.controller.d.ts.map