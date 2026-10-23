import type { Request, Response } from 'express';
import { z } from 'zod';
import { type IExpenseClaim } from '../models/index.js';
/**
 * Tell the claimant's reporting manager about a claim waiting for them — not
 * when the manager is the one who filed it. Never throws. (Also used by the
 * field travel allowance claim.)
 */
export declare function notifyManagerOfClaim(claim: IExpenseClaim): Promise<void>;
export declare const createCategorySchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
    requiresReceipt: z.ZodDefault<z.ZodBoolean>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    code: string;
    name: string;
    isActive: boolean;
    requiresReceipt: boolean;
    limit?: number | undefined;
    description?: string | undefined;
}, {
    code: string;
    name: string;
    limit?: number | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    requiresReceipt?: boolean | undefined;
}>;
export declare const updateCategorySchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    limit: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    requiresReceipt: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    limit?: number | undefined;
    name?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    requiresReceipt?: boolean | undefined;
}, {
    code?: string | undefined;
    limit?: number | undefined;
    name?: string | undefined;
    description?: string | undefined;
    isActive?: boolean | undefined;
    requiresReceipt?: boolean | undefined;
}>;
export declare const categoryQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    isActive?: boolean | undefined;
}, {
    page?: number | undefined;
    limit?: number | undefined;
    isActive?: boolean | undefined;
}>;
export declare function listCategories(req: Request, res: Response): Promise<void>;
export declare function createCategory(req: Request, res: Response): Promise<void>;
export declare function getCategory(req: Request, res: Response): Promise<void>;
export declare function updateCategory(req: Request, res: Response): Promise<void>;
export declare function deleteCategory(req: Request, res: Response): Promise<void>;
export declare const createClaimSchema: z.ZodEffects<z.ZodObject<{
    employeeId: z.ZodOptional<z.ZodString>;
    category: z.ZodString;
    amount: z.ZodNumber;
    currency: z.ZodDefault<z.ZodString>;
    date: z.ZodDate;
    description: z.ZodOptional<z.ZodString>;
    receiptUrls: z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        fileUrl: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        fileUrl: string;
    }, {
        name: string;
        fileUrl: string;
    }>, "many">>;
    paymentMethod: z.ZodOptional<z.ZodEnum<["cash", "bank", "card", "upi", "cheque", "other"]>>;
    status: z.ZodDefault<z.ZodEnum<["draft", "pending"]>>;
    /** The field visit the expense was incurred at (one of the claimant's own visits). */
    visitId: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "draft";
    date: Date;
    amount: number;
    category: string;
    currency: string;
    receiptUrls: {
        name: string;
        fileUrl: string;
    }[];
    description?: string | undefined;
    employeeId?: string | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}, {
    date: Date;
    amount: number;
    category: string;
    status?: "pending" | "draft" | undefined;
    description?: string | undefined;
    employeeId?: string | undefined;
    currency?: string | undefined;
    receiptUrls?: {
        name: string;
        fileUrl: string;
    }[] | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}>, {
    status: "pending" | "draft";
    date: Date;
    amount: number;
    category: string;
    currency: string;
    receiptUrls: {
        name: string;
        fileUrl: string;
    }[];
    description?: string | undefined;
    employeeId?: string | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}, {
    date: Date;
    amount: number;
    category: string;
    status?: "pending" | "draft" | undefined;
    description?: string | undefined;
    employeeId?: string | undefined;
    currency?: string | undefined;
    receiptUrls?: {
        name: string;
        fileUrl: string;
    }[] | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}>;
export declare const updateClaimSchema: z.ZodObject<Omit<{
    employeeId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    category: z.ZodOptional<z.ZodString>;
    amount: z.ZodOptional<z.ZodNumber>;
    currency: z.ZodOptional<z.ZodDefault<z.ZodString>>;
    date: z.ZodOptional<z.ZodDate>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    receiptUrls: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        fileUrl: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        fileUrl: string;
    }, {
        name: string;
        fileUrl: string;
    }>, "many">>>;
    paymentMethod: z.ZodOptional<z.ZodOptional<z.ZodEnum<["cash", "bank", "card", "upi", "cheque", "other"]>>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["draft", "pending"]>>>;
    visitId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "employeeId">, "strip", z.ZodTypeAny, {
    status?: "pending" | "draft" | undefined;
    date?: Date | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    category?: string | undefined;
    currency?: string | undefined;
    receiptUrls?: {
        name: string;
        fileUrl: string;
    }[] | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}, {
    status?: "pending" | "draft" | undefined;
    date?: Date | undefined;
    description?: string | undefined;
    amount?: number | undefined;
    category?: string | undefined;
    currency?: string | undefined;
    receiptUrls?: {
        name: string;
        fileUrl: string;
    }[] | undefined;
    paymentMethod?: "other" | "cash" | "bank" | "card" | "upi" | "cheque" | undefined;
    visitId?: string | undefined;
}>;
export declare const claimQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["draft", "pending", "approved", "rejected", "reimbursed"]>>;
    employeeId: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
    from: z.ZodOptional<z.ZodDate>;
    to: z.ZodOptional<z.ZodDate>;
    sort: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "pending" | "approved" | "rejected" | "draft" | "reimbursed" | undefined;
    sort?: string | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    category?: string | undefined;
}, {
    status?: "pending" | "approved" | "rejected" | "draft" | "reimbursed" | undefined;
    sort?: string | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    employeeId?: string | undefined;
    from?: Date | undefined;
    to?: Date | undefined;
    category?: string | undefined;
}>;
export declare const rejectClaimSchema: z.ZodObject<{
    reason: z.ZodString;
}, "strip", z.ZodTypeAny, {
    reason: string;
}, {
    reason: string;
}>;
export declare const reimburseClaimSchema: z.ZodObject<{
    reimbursementRef: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reimbursementRef?: string | undefined;
}, {
    reimbursementRef?: string | undefined;
}>;
export declare function listClaims(req: Request, res: Response): Promise<void>;
export declare function myClaims(req: Request, res: Response): Promise<void>;
export declare function teamClaims(req: Request, res: Response): Promise<void>;
export declare function createClaim(req: Request, res: Response): Promise<void>;
export declare function getClaim(req: Request, res: Response): Promise<void>;
export declare function updateClaim(req: Request, res: Response): Promise<void>;
export declare function deleteClaim(req: Request, res: Response): Promise<void>;
/** A bodyless approve (no `acceptedAmount`) approves the full amount. */
export declare const approveClaimSchema: z.ZodDefault<z.ZodObject<{
    acceptedAmount: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    acceptedAmount?: number | undefined;
}, {
    acceptedAmount?: number | undefined;
}>>;
export declare function approveClaim(req: Request, res: Response): Promise<void>;
export declare function rejectClaim(req: Request, res: Response): Promise<void>;
/**
 * Manual reimbursement (cash, a separate transfer). Approved claims are
 * otherwise paid with payroll: a payroll record that counted the claim holds
 * it until its cycle is paid and settled, and meanwhile it is refused here —
 * 409 `CLAIM_IN_PAYROLL` — rather than paid twice.
 */
export declare function reimburseClaim(req: Request, res: Response): Promise<void>;
export declare function expenseReports(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=expense-claims.controller.d.ts.map