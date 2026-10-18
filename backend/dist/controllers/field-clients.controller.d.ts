import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createClientSchema: z.ZodObject<{
    name: z.ZodString;
    contactPerson: z.ZodOptional<z.ZodString>;
    phone: z.ZodOptional<z.ZodString>;
    email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
    company: z.ZodOptional<z.ZodString>;
    category: z.ZodDefault<z.ZodEnum<["A", "B", "C"]>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    address: z.ZodOptional<z.ZodObject<{
        line1: z.ZodOptional<z.ZodString>;
        line2: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        pincode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }, {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }>>;
    location: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>, {
        type: "Point";
        coordinates: [number, number];
    }, {
        lat: number;
        lng: number;
    }>>;
    assignedTo: z.ZodOptional<z.ZodString>;
    territory: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["active", "inactive"]>>;
    customFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    status: "active" | "inactive";
    name: string;
    category: "A" | "B" | "C";
    email?: string | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    tags?: string[] | undefined;
    phone?: string | undefined;
    location?: {
        type: "Point";
        coordinates: [number, number];
    } | undefined;
    assignedTo?: string | undefined;
    contactPerson?: string | undefined;
    company?: string | undefined;
    territory?: string | undefined;
    customFields?: Record<string, unknown> | undefined;
}, {
    name: string;
    status?: "active" | "inactive" | undefined;
    email?: string | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    tags?: string[] | undefined;
    category?: "A" | "B" | "C" | undefined;
    phone?: string | undefined;
    location?: {
        lat: number;
        lng: number;
    } | undefined;
    assignedTo?: string | undefined;
    contactPerson?: string | undefined;
    company?: string | undefined;
    territory?: string | undefined;
    customFields?: Record<string, unknown> | undefined;
}>;
export declare const updateClientSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    contactPerson: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    phone: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    email: z.ZodOptional<z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>>;
    company: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    category: z.ZodOptional<z.ZodDefault<z.ZodEnum<["A", "B", "C"]>>>;
    tags: z.ZodOptional<z.ZodOptional<z.ZodArray<z.ZodString, "many">>>;
    address: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        line1: z.ZodOptional<z.ZodString>;
        line2: z.ZodOptional<z.ZodString>;
        city: z.ZodOptional<z.ZodString>;
        state: z.ZodOptional<z.ZodString>;
        pincode: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }, {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    }>>>;
    location: z.ZodOptional<z.ZodOptional<z.ZodEffects<z.ZodObject<{
        lat: z.ZodNumber;
        lng: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        lat: number;
        lng: number;
    }, {
        lat: number;
        lng: number;
    }>, {
        type: "Point";
        coordinates: [number, number];
    }, {
        lat: number;
        lng: number;
    }>>>;
    assignedTo: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    territory: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["active", "inactive"]>>>;
    customFields: z.ZodOptional<z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>>;
}, "strip", z.ZodTypeAny, {
    status?: "active" | "inactive" | undefined;
    email?: string | undefined;
    name?: string | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    tags?: string[] | undefined;
    category?: "A" | "B" | "C" | undefined;
    phone?: string | undefined;
    location?: {
        type: "Point";
        coordinates: [number, number];
    } | undefined;
    assignedTo?: string | undefined;
    contactPerson?: string | undefined;
    company?: string | undefined;
    territory?: string | undefined;
    customFields?: Record<string, unknown> | undefined;
}, {
    status?: "active" | "inactive" | undefined;
    email?: string | undefined;
    name?: string | undefined;
    address?: {
        state?: string | undefined;
        line1?: string | undefined;
        line2?: string | undefined;
        city?: string | undefined;
        pincode?: string | undefined;
    } | undefined;
    tags?: string[] | undefined;
    category?: "A" | "B" | "C" | undefined;
    phone?: string | undefined;
    location?: {
        lat: number;
        lng: number;
    } | undefined;
    assignedTo?: string | undefined;
    contactPerson?: string | undefined;
    company?: string | undefined;
    territory?: string | undefined;
    customFields?: Record<string, unknown> | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    category: z.ZodOptional<z.ZodEnum<["A", "B", "C"]>>;
    status: z.ZodOptional<z.ZodEnum<["active", "inactive"]>>;
    assignedTo: z.ZodOptional<z.ZodString>;
    territory: z.ZodOptional<z.ZodString>;
    search: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "active" | "inactive" | undefined;
    sort?: string | undefined;
    search?: string | undefined;
    category?: "A" | "B" | "C" | undefined;
    assignedTo?: string | undefined;
    territory?: string | undefined;
}, {
    status?: "active" | "inactive" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
    category?: "A" | "B" | "C" | undefined;
    assignedTo?: string | undefined;
    territory?: string | undefined;
}>;
export declare const nearbyQuerySchema: z.ZodObject<{
    lat: z.ZodNumber;
    lng: z.ZodNumber;
    radius: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    radius: number;
    lat: number;
    lng: number;
}, {
    lat: number;
    lng: number;
    limit?: number | undefined;
    radius?: number | undefined;
}>;
export declare const addNoteSchema: z.ZodObject<{
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
}, {
    text: string;
}>;
export declare function listClients(req: Request, res: Response): Promise<void>;
export declare function nearbyClients(req: Request, res: Response): Promise<void>;
export declare function clientsMap(_req: Request, res: Response): Promise<void>;
export declare function createClient(req: Request, res: Response): Promise<void>;
export declare function getClient(req: Request, res: Response): Promise<void>;
export declare function updateClient(req: Request, res: Response): Promise<void>;
export declare function deleteClient(req: Request, res: Response): Promise<void>;
export declare function addClientNote(req: Request, res: Response): Promise<void>;
export declare const importSchema: z.ZodObject<{
    clients: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        contactPerson: z.ZodOptional<z.ZodString>;
        phone: z.ZodOptional<z.ZodString>;
        email: z.ZodUnion<[z.ZodOptional<z.ZodString>, z.ZodLiteral<"">]>;
        company: z.ZodOptional<z.ZodString>;
        category: z.ZodDefault<z.ZodEnum<["A", "B", "C"]>>;
        tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        address: z.ZodOptional<z.ZodObject<{
            line1: z.ZodOptional<z.ZodString>;
            line2: z.ZodOptional<z.ZodString>;
            city: z.ZodOptional<z.ZodString>;
            state: z.ZodOptional<z.ZodString>;
            pincode: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        }, {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        }>>;
        location: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            lat: z.ZodNumber;
            lng: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            lat: number;
            lng: number;
        }, {
            lat: number;
            lng: number;
        }>, {
            type: "Point";
            coordinates: [number, number];
        }, {
            lat: number;
            lng: number;
        }>>;
        assignedTo: z.ZodOptional<z.ZodString>;
        territory: z.ZodOptional<z.ZodString>;
        status: z.ZodDefault<z.ZodEnum<["active", "inactive"]>>;
        customFields: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        status: "active" | "inactive";
        name: string;
        category: "A" | "B" | "C";
        email?: string | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        tags?: string[] | undefined;
        phone?: string | undefined;
        location?: {
            type: "Point";
            coordinates: [number, number];
        } | undefined;
        assignedTo?: string | undefined;
        contactPerson?: string | undefined;
        company?: string | undefined;
        territory?: string | undefined;
        customFields?: Record<string, unknown> | undefined;
    }, {
        name: string;
        status?: "active" | "inactive" | undefined;
        email?: string | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        tags?: string[] | undefined;
        category?: "A" | "B" | "C" | undefined;
        phone?: string | undefined;
        location?: {
            lat: number;
            lng: number;
        } | undefined;
        assignedTo?: string | undefined;
        contactPerson?: string | undefined;
        company?: string | undefined;
        territory?: string | undefined;
        customFields?: Record<string, unknown> | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    clients: {
        status: "active" | "inactive";
        name: string;
        category: "A" | "B" | "C";
        email?: string | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        tags?: string[] | undefined;
        phone?: string | undefined;
        location?: {
            type: "Point";
            coordinates: [number, number];
        } | undefined;
        assignedTo?: string | undefined;
        contactPerson?: string | undefined;
        company?: string | undefined;
        territory?: string | undefined;
        customFields?: Record<string, unknown> | undefined;
    }[];
}, {
    clients: {
        name: string;
        status?: "active" | "inactive" | undefined;
        email?: string | undefined;
        address?: {
            state?: string | undefined;
            line1?: string | undefined;
            line2?: string | undefined;
            city?: string | undefined;
            pincode?: string | undefined;
        } | undefined;
        tags?: string[] | undefined;
        category?: "A" | "B" | "C" | undefined;
        phone?: string | undefined;
        location?: {
            lat: number;
            lng: number;
        } | undefined;
        assignedTo?: string | undefined;
        contactPerson?: string | undefined;
        company?: string | undefined;
        territory?: string | undefined;
        customFields?: Record<string, unknown> | undefined;
    }[];
}>;
export declare function importClients(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-clients.controller.d.ts.map