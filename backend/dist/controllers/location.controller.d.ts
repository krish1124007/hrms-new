import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createLocationSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["office", "branch", "warehouse", "site"]>>;
    address: z.ZodString;
    coordinates: z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>;
    phone: z.ZodOptional<z.ZodString>;
    manager: z.ZodOptional<z.ZodString>;
    employees: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "site" | "office" | "branch" | "warehouse";
    name: string;
    address: string;
    isActive: boolean;
    employees: string[];
    phone?: string | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    } | undefined;
    manager?: string | undefined;
}, {
    name: string;
    address: string;
    type?: "site" | "office" | "branch" | "warehouse" | undefined;
    phone?: string | undefined;
    isActive?: boolean | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    } | undefined;
    employees?: string[] | undefined;
    manager?: string | undefined;
}>;
export declare const updateLocationSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodDefault<z.ZodEnum<["office", "branch", "warehouse", "site"]>>>;
    address: z.ZodOptional<z.ZodString>;
    coordinates: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    manager: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    employees: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodString, "many">>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    type?: "site" | "office" | "branch" | "warehouse" | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    address?: string | undefined;
    isActive?: boolean | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    } | undefined;
    employees?: string[] | undefined;
    manager?: string | undefined;
}, {
    type?: "site" | "office" | "branch" | "warehouse" | undefined;
    name?: string | undefined;
    phone?: string | undefined;
    address?: string | undefined;
    isActive?: boolean | undefined;
    coordinates?: {
        lat: number;
        lng: number;
    } | undefined;
    employees?: string[] | undefined;
    manager?: string | undefined;
}>;
export declare const assignEmployeesSchema: z.ZodObject<{
    employeeIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    employeeIds: string[];
}, {
    employeeIds: string[];
}>;
export declare function listLocations(req: Request, res: Response): Promise<void>;
export declare function createLocation(req: Request, res: Response): Promise<void>;
export declare function getLocation(req: Request, res: Response): Promise<void>;
export declare function updateLocation(req: Request, res: Response): Promise<void>;
export declare function deleteLocation(req: Request, res: Response): Promise<void>;
export declare function assignEmployees(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=location.controller.d.ts.map