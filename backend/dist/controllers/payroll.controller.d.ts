import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const componentSchema: z.ZodObject<{
    name: z.ZodString;
    code: z.ZodString;
    type: z.ZodEnum<["earning", "deduction", "employer_contribution"]>;
    calculationType: z.ZodDefault<z.ZodEnum<["fixed", "percentage_of_basic", "percentage_of_gross"]>>;
    defaultValue: z.ZodDefault<z.ZodNumber>;
    isTaxable: z.ZodDefault<z.ZodBoolean>;
    isStatutory: z.ZodDefault<z.ZodBoolean>;
    statutoryType: z.ZodOptional<z.ZodEnum<["pf_employee", "pf_employer", "esic_employee", "esic_employer", "professional_tax", "tds"]>>;
    /**
     * PF wage: `basic` / `da` — part of it; `none` — never part of it; null —
     * decided by the component's name (Basic / Dearness / DA).
     */
    statutoryBase: z.ZodOptional<z.ZodNullable<z.ZodEnum<["basic", "da", "none"]>>>;
    order: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    code: string;
    type: "earning" | "deduction" | "employer_contribution";
    name: string;
    calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
    isActive: boolean;
    order: number;
    defaultValue: number;
    isTaxable: boolean;
    isStatutory: boolean;
    statutoryType?: "tds" | "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | undefined;
    statutoryBase?: "none" | "basic" | "da" | null | undefined;
}, {
    code: string;
    type: "earning" | "deduction" | "employer_contribution";
    name: string;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    statutoryType?: "tds" | "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | undefined;
    order?: number | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryBase?: "none" | "basic" | "da" | null | undefined;
}>;
export declare const updateComponentSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    code: z.ZodOptional<z.ZodString>;
    type: z.ZodOptional<z.ZodEnum<["earning", "deduction", "employer_contribution"]>>;
    calculationType: z.ZodOptional<z.ZodDefault<z.ZodEnum<["fixed", "percentage_of_basic", "percentage_of_gross"]>>>;
    defaultValue: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    isTaxable: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    isStatutory: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    statutoryType: z.ZodOptional<z.ZodOptional<z.ZodEnum<["pf_employee", "pf_employer", "esic_employee", "esic_employer", "professional_tax", "tds"]>>>;
    statutoryBase: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodEnum<["basic", "da", "none"]>>>>;
    order: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
    name?: string | undefined;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    statutoryType?: "tds" | "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | undefined;
    order?: number | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryBase?: "none" | "basic" | "da" | null | undefined;
}, {
    code?: string | undefined;
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
    name?: string | undefined;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    statutoryType?: "tds" | "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | undefined;
    order?: number | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryBase?: "none" | "basic" | "da" | null | undefined;
}>;
export declare const componentQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    type: z.ZodOptional<z.ZodEnum<["earning", "deduction", "employer_contribution"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
}, {
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
}>;
export declare function listComponents(req: Request, res: Response): Promise<void>;
export declare function createComponent(req: Request, res: Response): Promise<void>;
export declare function getComponent(req: Request, res: Response): Promise<void>;
export declare function updateComponent(req: Request, res: Response): Promise<void>;
export declare function deleteComponent(req: Request, res: Response): Promise<void>;
export declare const structureSchema: z.ZodObject<{
    name: z.ZodString;
    components: z.ZodDefault<z.ZodArray<z.ZodObject<{
        componentId: z.ZodString;
        calculationType: z.ZodEnum<["fixed", "percentage_of_basic", "percentage_of_gross"]>;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }, {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }>, "many">>;
    isDefault: z.ZodDefault<z.ZodBoolean>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    components: {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }[];
    isActive: boolean;
    isDefault: boolean;
}, {
    name: string;
    components?: {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }[] | undefined;
    isActive?: boolean | undefined;
    isDefault?: boolean | undefined;
}>;
export declare const updateStructureSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    components: z.ZodOptional<z.ZodDefault<z.ZodArray<z.ZodObject<{
        componentId: z.ZodString;
        calculationType: z.ZodEnum<["fixed", "percentage_of_basic", "percentage_of_gross"]>;
        value: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }, {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }>, "many">>>;
    isDefault: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    components?: {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }[] | undefined;
    isActive?: boolean | undefined;
    isDefault?: boolean | undefined;
}, {
    name?: string | undefined;
    components?: {
        value: number;
        calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
        componentId: string;
    }[] | undefined;
    isActive?: boolean | undefined;
    isDefault?: boolean | undefined;
}>;
export declare function listStructures(_req: Request, res: Response): Promise<void>;
export declare function createStructure(req: Request, res: Response): Promise<void>;
export declare function getStructure(req: Request, res: Response): Promise<void>;
export declare function updateStructure(req: Request, res: Response): Promise<void>;
export declare function deleteStructure(req: Request, res: Response): Promise<void>;
export declare const assignStructureSchema: z.ZodObject<{
    employeeIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    employeeIds: string[];
}, {
    employeeIds: string[];
}>;
/** Puts the employees on the structure: payroll takes their earning lines from it. */
export declare function assignStructure(req: Request, res: Response): Promise<void>;
export declare const createCycleSchema: z.ZodObject<{
    month: z.ZodNumber;
    year: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
    month: number;
}, {
    year: number;
    month: number;
}>;
export declare const cycleQuerySchema: z.ZodObject<{
    page: z.ZodDefault<z.ZodNumber>;
    limit: z.ZodDefault<z.ZodNumber>;
    year: z.ZodOptional<z.ZodNumber>;
    status: z.ZodOptional<z.ZodEnum<["draft", "processing", "processed", "paid", "locked"]>>;
}, "strip", z.ZodTypeAny, {
    page: number;
    limit: number;
    status?: "draft" | "processing" | "processed" | "locked" | "paid" | undefined;
    year?: number | undefined;
}, {
    status?: "draft" | "processing" | "processed" | "locked" | "paid" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    year?: number | undefined;
}>;
export declare function listCycles(req: Request, res: Response): Promise<void>;
export declare function createCycle(req: Request, res: Response): Promise<void>;
export declare function getCycle(req: Request, res: Response): Promise<void>;
/**
 * (Re)builds every record of a draft or processed cycle (or of one left in
 * `processing` by a crashed run). HR overrides (`manualAdjustments`) on the
 * records being replaced are carried over by employee and re-applied to the
 * fresh figures.
 *
 * Failure handling (no transactions): before the old records are deleted a
 * failure puts the cycle back where it was. After, the cycle drops to
 * `draft` — it can be re-processed but not locked — with totals from the
 * records that were saved; overrides of the employees not yet saved are
 * lost and logged.
 */
export declare function processCycle(req: Request, res: Response): Promise<void>;
export declare function listCycleRecords(req: Request, res: Response): Promise<void>;
/**
 * HR edits a record only through its manual adjustments. Line arrays and the
 * computed fields (overtime, late deduction, leave balance) are not editable;
 * unknown keys are dropped.
 */
export declare const updateRecordSchema: z.ZodObject<{
    arrears: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    advance: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    expense: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    reimbursements: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    loanDeduction: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    tds: z.ZodOptional<z.ZodUnion<[z.ZodNull, z.ZodNumber]>>;
    note: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    tds?: number | null | undefined;
    arrears?: number | null | undefined;
    advance?: number | null | undefined;
    expense?: number | null | undefined;
    reimbursements?: number | null | undefined;
    loanDeduction?: number | null | undefined;
    note?: string | null | undefined;
}, {
    tds?: number | null | undefined;
    arrears?: number | null | undefined;
    advance?: number | null | undefined;
    expense?: number | null | undefined;
    reimbursements?: number | null | undefined;
    loanDeduction?: number | null | undefined;
    note?: string | null | undefined;
}>;
export declare function updateRecord(req: Request, res: Response): Promise<void>;
export declare function generatePayslips(req: Request, res: Response): Promise<void>;
/** processed → locked. From here the figures are final and employees can see them. */
export declare function lockCycle(req: Request, res: Response): Promise<void>;
export declare const markPaidSchema: z.ZodObject<{
    paymentRef: z.ZodString;
    paidAt: z.ZodOptional<z.ZodNullable<z.ZodDate>>;
}, "strip", z.ZodTypeAny, {
    paymentRef: string;
    paidAt?: Date | null | undefined;
}, {
    paymentRef: string;
    paidAt?: Date | null | undefined;
}>;
/**
 * locked → paid: every record is marked paid, then loans/claims settle. The
 * money has gone out by now, so a failed settlement does not fail the
 * request: it is logged, reported as `settlement: { ok: false }`, and
 * retried with POST /payroll/cycles/:id/settle.
 */
export declare function markCyclePaid(req: Request, res: Response): Promise<void>;
/**
 * Settles a paid cycle's loans and claims again — after a settlement that
 * failed part-way. Only what is still open is settled.
 */
export declare function settlePaidCycle(req: Request, res: Response): Promise<void>;
export declare function getRecord(req: Request, res: Response): Promise<void>;
export declare function downloadPayslip(req: Request, res: Response): Promise<void>;
export declare const monthlyReportQuery: z.ZodObject<{
    year: z.ZodNumber;
    month: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
    month: number;
}, {
    year: number;
    month: number;
}>;
export declare function monthlyReport(req: Request, res: Response): Promise<void>;
export declare const yearlyReportQuery: z.ZodObject<{
    year: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    year: number;
}, {
    year: number;
}>;
export declare function yearlyReport(req: Request, res: Response): Promise<void>;
export declare function statutoryReport(req: Request, res: Response): Promise<void>;
export declare function myPayslips(_req: Request, res: Response): Promise<void>;
//# sourceMappingURL=payroll.controller.d.ts.map