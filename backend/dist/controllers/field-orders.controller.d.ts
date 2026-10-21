import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createOrderSchema: z.ZodObject<{
    clientId: z.ZodEffects<z.ZodString, string, string>;
    /** Honoured only for a field manager (book an order for a rep). */
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodEffects<z.ZodString, string, string>;
        quantity: z.ZodNumber;
        /** Line discount in percent (0–100); `discount` is the mobile app's name for it. */
        discountPercent: z.ZodOptional<z.ZodNumber>;
        discount: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }, {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }>, "many">;
    deliveryDate: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
    visitId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    items: {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }[];
    clientId: string;
    employeeId?: string | undefined;
    notes?: string | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
}, {
    items: {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }[];
    clientId: string;
    employeeId?: string | undefined;
    notes?: string | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
}>;
export declare const updateOrderSchema: z.ZodObject<{
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        productId: z.ZodEffects<z.ZodString, string, string>;
        quantity: z.ZodNumber;
        /** Line discount in percent (0–100); `discount` is the mobile app's name for it. */
        discountPercent: z.ZodOptional<z.ZodNumber>;
        discount: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }, {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }>, "many">>;
    deliveryDate: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    items?: {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }[] | undefined;
    notes?: string | undefined;
    deliveryDate?: Date | undefined;
}, {
    items?: {
        quantity: number;
        productId: string;
        discountPercent?: number | undefined;
        discount?: number | undefined;
    }[] | undefined;
    notes?: string | undefined;
    deliveryDate?: Date | undefined;
}>;
export declare const statusSchema: z.ZodObject<{
    status: z.ZodEffects<z.ZodEnum<["pending", "confirmed", "delivered", "cancelled"]>, "pending" | "cancelled" | "confirmed" | "delivered", unknown>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "cancelled" | "confirmed" | "delivered";
}, {
    status?: unknown;
}>;
export declare const listQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    clientId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    status: z.ZodOptional<z.ZodEffects<z.ZodEnum<["pending", "confirmed", "delivered", "cancelled"]>, "pending" | "cancelled" | "confirmed" | "delivered", unknown>>;
    paymentStatus: z.ZodOptional<z.ZodEnum<["pending", "partial", "paid"]>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "pending" | "cancelled" | "confirmed" | "delivered" | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    paymentStatus?: "pending" | "paid" | "partial" | undefined;
}, {
    status?: unknown;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
    paymentStatus?: "pending" | "paid" | "partial" | undefined;
}>;
export declare const myQuerySchema: z.ZodObject<{
    status: z.ZodOptional<z.ZodEffects<z.ZodEnum<["pending", "confirmed", "delivered", "cancelled"]>, "pending" | "cancelled" | "confirmed" | "delivered", unknown>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "pending" | "cancelled" | "confirmed" | "delivered" | undefined;
}, {
    status?: unknown;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const reportQuerySchema: z.ZodObject<{
    from: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
}, "strip", z.ZodTypeAny, {
    employeeId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}, {
    employeeId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
}>;
export declare function listOrders(req: Request, res: Response): Promise<void>;
export declare function myOrders(req: Request, res: Response): Promise<void>;
export declare function getOrder(req: Request, res: Response): Promise<void>;
export declare function createOrder(req: Request, res: Response): Promise<void>;
/** Edit notes/delivery date; items only while the order is still pending (repriced here). */
export declare function updateOrder(req: Request, res: Response): Promise<void>;
/** Soft-delete (field managers). An order with payments against it is cancelled instead. */
export declare function deleteOrder(req: Request, res: Response): Promise<void>;
export declare function updateOrderStatus(req: Request, res: Response): Promise<void>;
/** Totals by status over `[from, to)` (default: this IST month to now), in the caller's scope. */
export declare function orderReports(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-orders.controller.d.ts.map