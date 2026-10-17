import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const createPaymentSchema: z.ZodObject<{
    clientId: z.ZodString;
    employeeId: z.ZodOptional<z.ZodString>;
    amount: z.ZodNumber;
    method: z.ZodEnum<["cash", "cheque", "upi", "bank_transfer", "other"]>;
    reference: z.ZodOptional<z.ZodString>;
    collectedAt: z.ZodOptional<z.ZodDate>;
    visitId: z.ZodOptional<z.ZodString>;
    orderId: z.ZodOptional<z.ZodString>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    clientId: string;
    method: "cash" | "upi" | "cheque" | "other" | "bank_transfer";
    employeeId?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | undefined;
}, {
    amount: number;
    clientId: string;
    method: "cash" | "upi" | "cheque" | "other" | "bank_transfer";
    employeeId?: string | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | undefined;
}>;
export declare const updatePaymentSchema: z.ZodObject<{
    clientId: z.ZodOptional<z.ZodString>;
    employeeId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    amount: z.ZodOptional<z.ZodNumber>;
    method: z.ZodOptional<z.ZodEnum<["cash", "cheque", "upi", "bank_transfer", "other"]>>;
    reference: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    collectedAt: z.ZodOptional<z.ZodOptional<z.ZodDate>>;
    visitId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    orderId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    notes: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    employeeId?: string | undefined;
    amount?: number | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | undefined;
}, {
    employeeId?: string | undefined;
    amount?: number | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    notes?: string | undefined;
    visitId?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    employeeId: z.ZodOptional<z.ZodString>;
    clientId: z.ZodOptional<z.ZodString>;
    method: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodString>;
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
    method?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}, {
    status?: string | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    method?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
}>;
export declare function listPayments(req: Request, res: Response): Promise<void>;
export declare function myPayments(req: Request, res: Response): Promise<void>;
export declare function getPayment(req: Request, res: Response): Promise<void>;
export declare function createPayment(req: Request, res: Response): Promise<void>;
export declare function updatePayment(req: Request, res: Response): Promise<void>;
export declare function deletePayment(req: Request, res: Response): Promise<void>;
export declare function verifyPayment(req: Request, res: Response): Promise<void>;
export declare function dailyReport(req: Request, res: Response): Promise<void>;
export declare function outstandingReport(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-payments.controller.d.ts.map