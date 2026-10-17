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
        quantity: number;
        total: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }, {
        name: string;
        quantity: number;
        total: number;
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
    status: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped";
    items: {
        name: string;
        quantity: number;
        total: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }[];
    clientId: string;
    taxAmount: number;
    employeeId?: string | undefined;
    notes?: string | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
}, {
    items: {
        name: string;
        quantity: number;
        total: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }[];
    clientId: string;
    status?: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped" | undefined;
    employeeId?: string | undefined;
    notes?: string | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
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
        quantity: number;
        total: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }, {
        name: string;
        quantity: number;
        total: number;
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
    status?: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped" | undefined;
    items?: {
        name: string;
        quantity: number;
        total: number;
        unitPrice: number;
        discount: number;
        productId?: string | undefined;
    }[] | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    notes?: string | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
}, {
    status?: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped" | undefined;
    items?: {
        name: string;
        quantity: number;
        total: number;
        unitPrice: number;
        productId?: string | undefined;
        discount?: number | undefined;
    }[] | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    notes?: string | undefined;
    taxAmount?: number | undefined;
    deliveryDate?: Date | undefined;
    visitId?: string | undefined;
}>;
export declare const statusSchema: z.ZodObject<{
    status: z.ZodEnum<["draft", "confirmed", "processing", "shipped", "delivered", "cancelled"]>;
}, "strip", z.ZodTypeAny, {
    status: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped";
}, {
    status: "cancelled" | "confirmed" | "delivered" | "draft" | "processing" | "shipped";
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
    page: number;
    limit: number;
    status?: string | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    paymentStatus?: string | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    paymentStatus?: string | undefined;
}>;
export declare function listOrders(req: Request, res: Response): Promise<void>;
export declare function myOrders(req: Request, res: Response): Promise<void>;
export declare function getOrder(req: Request, res: Response): Promise<void>;
export declare function createOrder(req: Request, res: Response): Promise<void>;
export declare function updateOrder(req: Request, res: Response): Promise<void>;
export declare function deleteOrder(req: Request, res: Response): Promise<void>;
export declare function updateOrderStatus(req: Request, res: Response): Promise<void>;
export declare function orderReports(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-orders.controller.d.ts.map