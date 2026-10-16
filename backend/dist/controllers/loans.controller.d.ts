import type { Request, Response } from 'express';
import { z } from 'zod';
/** GET /api/v1/loans/me — loans belonging to the calling employee. Auth-only. */
export declare function myLoans(_req: Request, res: Response): Promise<void>;
export declare const createLoanSchema: z.ZodObject<{
    employee: z.ZodString;
    type: z.ZodDefault<z.ZodEnum<["salary_advance", "personal_loan", "emergency", "education", "medical", "other"]>>;
    principalAmount: z.ZodNumber;
    interestRate: z.ZodDefault<z.ZodNumber>;
    tenureMonths: z.ZodNumber;
    reason: z.ZodOptional<z.ZodString>;
    startMonth: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical";
    employee: string;
    principalAmount: number;
    interestRate: number;
    tenureMonths: number;
    notes?: string | undefined;
    reason?: string | undefined;
    startMonth?: Date | undefined;
}, {
    employee: string;
    principalAmount: number;
    tenureMonths: number;
    type?: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical" | undefined;
    notes?: string | undefined;
    reason?: string | undefined;
    interestRate?: number | undefined;
    startMonth?: Date | undefined;
}>;
export declare const updateLoanSchema: z.ZodObject<{
    type: z.ZodOptional<z.ZodEnum<["salary_advance", "personal_loan", "emergency", "education", "medical", "other"]>>;
    principalAmount: z.ZodOptional<z.ZodNumber>;
    interestRate: z.ZodOptional<z.ZodNumber>;
    tenureMonths: z.ZodOptional<z.ZodNumber>;
    reason: z.ZodOptional<z.ZodString>;
    startMonth: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    type?: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical" | undefined;
    notes?: string | undefined;
    reason?: string | undefined;
    principalAmount?: number | undefined;
    interestRate?: number | undefined;
    tenureMonths?: number | undefined;
    startMonth?: Date | undefined;
}, {
    type?: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical" | undefined;
    notes?: string | undefined;
    reason?: string | undefined;
    principalAmount?: number | undefined;
    interestRate?: number | undefined;
    tenureMonths?: number | undefined;
    startMonth?: Date | undefined;
}>;
export declare const listQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    search: z.ZodOptional<z.ZodString>;
    status: z.ZodOptional<z.ZodEnum<["pending", "approved", "rejected", "disbursed", "active", "closed", "cancelled"]>>;
    type: z.ZodOptional<z.ZodEnum<["salary_advance", "personal_loan", "emergency", "education", "medical", "other"]>>;
    employee: z.ZodOptional<z.ZodString>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    page: number;
    type?: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical" | undefined;
    sort?: string | undefined;
    status?: "active" | "pending" | "approved" | "rejected" | "cancelled" | "disbursed" | "closed" | undefined;
    search?: string | undefined;
    employee?: string | undefined;
}, {
    limit?: number | undefined;
    type?: "other" | "salary_advance" | "personal_loan" | "emergency" | "education" | "medical" | undefined;
    sort?: string | undefined;
    status?: "active" | "pending" | "approved" | "rejected" | "cancelled" | "disbursed" | "closed" | undefined;
    page?: number | undefined;
    search?: string | undefined;
    employee?: string | undefined;
}>;
export declare const approveLoanSchema: z.ZodObject<{
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    notes?: string | undefined;
}, {
    notes?: string | undefined;
}>;
export declare const rejectLoanSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const disburseLoanSchema: z.ZodObject<{
    disbursedOn: z.ZodOptional<z.ZodDate>;
    startMonth: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    disbursedOn?: Date | undefined;
    startMonth?: Date | undefined;
}, {
    disbursedOn?: Date | undefined;
    startMonth?: Date | undefined;
}>;
export declare const recordPaymentSchema: z.ZodObject<{
    installmentId: z.ZodString;
    amount: z.ZodNumber;
    paidOn: z.ZodOptional<z.ZodDate>;
    notes: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    amount: number;
    installmentId: string;
    notes?: string | undefined;
    paidOn?: Date | undefined;
}, {
    amount: number;
    installmentId: string;
    notes?: string | undefined;
    paidOn?: Date | undefined;
}>;
/** GET /api/v1/loans */
export declare function listLoans(req: Request, res: Response): Promise<void>;
/** GET /api/v1/loans/stats */
export declare function loanStats(_req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans */
export declare function createLoan(req: Request, res: Response): Promise<void>;
/** GET /api/v1/loans/:id */
export declare function getLoan(req: Request, res: Response): Promise<void>;
/** PATCH /api/v1/loans/:id */
export declare function updateLoan(req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans/:id/approve */
export declare function approveLoan(req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans/:id/reject */
export declare function rejectLoan(req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans/:id/disburse */
export declare function disburseLoan(req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans/:id/payments */
export declare function recordPayment(req: Request, res: Response): Promise<void>;
/** DELETE /api/v1/loans/:id */
export declare function deleteLoan(req: Request, res: Response): Promise<void>;
/** POST /api/v1/loans/preview-emi — quick EMI calculator without persisting */
export declare const previewEmiSchema: z.ZodObject<{
    principalAmount: z.ZodNumber;
    interestRate: z.ZodDefault<z.ZodNumber>;
    tenureMonths: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    principalAmount: number;
    interestRate: number;
    tenureMonths: number;
}, {
    principalAmount: number;
    tenureMonths: number;
    interestRate?: number | undefined;
}>;
export declare function previewEmi(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=loans.controller.d.ts.map