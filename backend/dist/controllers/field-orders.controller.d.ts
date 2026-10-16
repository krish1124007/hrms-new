import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createOrderSchema: z.ZodObject<{
    clientId: z.ZodString;
    employeeId: z.ZodOptional<z.ZodString>;
    items: z.ZodArray<z.ZodObject<{
        productId: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        discount: z.ZodDefault<z.ZodNumber>;
        total: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }, {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }>, "many">;
    taxAmount: z.ZodDefault<z.ZodNumber>;
    status: z.ZodDefault<z.ZodEnum<["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"]>>;
    deliveryDate: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
    visitId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered";
    clientId: string;
    items: {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }[];
    taxAmount: number;
    notes?: string | undefined;
    employeeId?: string | undefined;
    visitId?: string | undefined;
    deliveryDate?: Date | undefined;
}, {
    clientId: string;
    items: {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }[];
    status?: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered" | undefined;
    notes?: string | undefined;
    employeeId?: string | undefined;
    visitId?: string | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
}>;
export declare const updateOrderSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    employeeId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    items: z.ZodOptional<z.ZodArray<z.ZodObject<{
        productId: z.ZodOptional<z.ZodString>;
        name: z.ZodString;
        quantity: z.ZodNumber;
        unitPrice: z.ZodNumber;
        discount: z.ZodDefault<z.ZodNumber>;
        total: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }, {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }>, "many">>;
    taxAmount: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"]>>>;
    deliveryDate: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    visitId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    status?: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered" | undefined;
    notes?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    visitId?: string | undefined;
    items?: {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }[] | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
}, {
    status?: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered" | undefined;
    notes?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    visitId?: string | undefined;
    items?: {
        name: string;
        total: number;
        quantity: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }[] | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
}>;
export declare const statusSchema: z.ZodObject<{
    status: z.ZodEnum<["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered";
}, {
    status: "cancelled" | "draft" | "processing" | "confirmed" | "shipped" | "delivered";
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
    paymentStatus: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    sort?: string | undefined;
    status?: string | undefined;
    to?: Date | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    clientId?: string | undefined;
    paymentStatus?: string | undefined;
}, {
    limit?: number | undefined;
    sort?: string | undefined;
    status?: string | undefined;
    to?: Date | undefined;
    page?: number | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    clientId?: string | undefined;
    paymentStatus?: string | undefined;
}>;
export declare function listOrders(req: Request, res: Response): Promise<void>;
export declare function myOrders(_req: Request, res: Response): Promise<void>;
export declare function getOrder(req: Request, res: Response): Promise<void>;
export declare function createOrder(req: Request, res: Response): Promise<void>;
export declare function updateOrder(req: Request, res: Response): Promise<void>;
export declare function deleteOrder(req: Request, res: Response): Promise<void>;
export declare function updateOrderStatus(req: Request, res: Response): Promise<void>;
export declare function orderReports(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-orders.controller.d.ts.map