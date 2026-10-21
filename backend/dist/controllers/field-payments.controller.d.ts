import type { Request, Response } from 'express';
import { z } from 'zod';
/** The largest single collection: ₹10 crore. */
export declare const MAX_PAYMENT_AMOUNT = 100000000;
/** How far back a rep may date a collection; field managers may go further. */
export declare const MAX_BACKDATE_DAYS = 7;
export declare const createPaymentSchema: z.ZodObject<{
    clientId: z.ZodEffects<z.ZodString, string, string>;
    /** Honoured only for a field manager (record a collection for a rep). */
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    amount: z.ZodNumber;
    method: z.ZodEnum<["cash", "cheque", "upi", "bank_transfer", "other"]>;
    reference: z.ZodOptional<z.ZodString>;
    collectedAt: z.ZodOptional<z.ZodEffects<z.ZodDate, Date, Date>>;
    visitId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    orderId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
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
    clientId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    amount: z.ZodOptional<z.ZodNumber>;
    method: z.ZodOptional<z.ZodEnum<["cash", "cheque", "upi", "bank_transfer", "other"]>>;
    reference: z.ZodOptional<z.ZodString>;
    collectedAt: z.ZodOptional<z.ZodEffects<z.ZodDate, Date, Date>>;
    /** `null` unlinks the payment from its order. */
    orderId: z.ZodOptional<z.ZodNullable<z.ZodEffects<z.ZodString, string, string>>>;
    notes: z.ZodOptional<z.ZodString>;
    /** `bounced` stops the payment counting as received; `collected` takes a bounce back. */
    status: z.ZodOptional<z.ZodEnum<["collected", "bounced"]>>;
}, "strip", z.ZodTypeAny, {
    status?: "collected" | "bounced" | undefined;
    amount?: number | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    notes?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | null | undefined;
}, {
    status?: "collected" | "bounced" | undefined;
    amount?: number | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    notes?: string | undefined;
    reference?: string | undefined;
    collectedAt?: Date | undefined;
    orderId?: string | null | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    clientId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    orderId: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    method: z.ZodOptional<z.ZodEnum<["cash", "cheque", "upi", "bank_transfer", "other"]>>;
    status: z.ZodOptional<z.ZodEnum<["collected", "deposited", "verified", "bounced"]>>;
    from: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    to: z.ZodOptional<z.ZodEffects<z.ZodString, Date, string>>;
    sort: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "collected" | "deposited" | "verified" | "bounced" | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    orderId?: string | undefined;
}, {
    status?: "collected" | "deposited" | "verified" | "bounced" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    clientId?: string | undefined;
    method?: "cash" | "upi" | "cheque" | "other" | "bank_transfer" | undefined;
    from?: string | undefined;
    to?: string | undefined;
    orderId?: string | undefined;
}>;
export declare const myQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
}, {
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare const outstandingQuerySchema: z.ZodObject<{
    search: z.ZodOptional<z.ZodString>;
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    search?: string | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    search?: string | undefined;
}>;
export declare function listPayments(req: Request, res: Response): Promise<void>;
export declare function myPayments(req: Request, res: Response): Promise<void>;
export declare function getPayment(req: Request, res: Response): Promise<void>;
/**
 * GET /field/payments/:id/receipt — the receipt as a PDF (rendered on demand).
 * Same visibility as reading the payment.
 */
export declare function paymentReceipt(req: Request, res: Response): Promise<void>;
export declare function createPayment(req: Request, res: Response): Promise<void>;
/**
 * Field managers: correct amount, method, client, order link; mark a cheque
 * bounced (from any status) or take a bounce back (`bounced → collected`).
 * Whenever the edit makes the payment count towards an order — a new amount,
 * order or client, or an un-bounce — the order must still have room for it.
 */
export declare function updatePayment(req: Request, res: Response): Promise<void>;
export declare function deletePayment(req: Request, res: Response): Promise<void>;
/** The collecting rep (or a manager) records that a verified payment was deposited. */
export declare function depositPayment(req: Request, res: Response): Promise<void>;
/** Field managers verify a collected payment (before it is deposited). */
export declare function verifyPayment(req: Request, res: Response): Promise<void>;
/**
 * Collections on one IST day (`?date=YYYY-MM-DD`, default today), in the
 * caller's scope — bounced and deleted payments are not money collected.
 */
export declare function dailyReport(req: Request, res: Response): Promise<void>;
/**
 * Clients with money outstanding, largest first, paginated. Field managers see
 * every client; anyone else the clients assigned to them or their reports.
 */
export declare function outstandingReport(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-payments.controller.d.ts.map