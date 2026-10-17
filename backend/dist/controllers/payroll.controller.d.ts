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
    order: z.ZodDefault<z.ZodNumber>;
    isActive: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    code: string;
    type: "earning" | "deduction" | "employer_contribution";
    name: string;
    calculationType: "fixed" | "percentage_of_basic" | "percentage_of_gross";
    isActive: boolean;
    defaultValue: number;
    isTaxable: boolean;
    isStatutory: boolean;
    order: number;
    statutoryType?: "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | "tds" | undefined;
}, {
    code: string;
    type: "earning" | "deduction" | "employer_contribution";
    name: string;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryType?: "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | "tds" | undefined;
    order?: number | undefined;
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
    order: z.ZodOptional<z.ZodDefault<z.ZodNumber>>;
    isActive: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    code?: string | undefined;
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
    name?: string | undefined;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryType?: "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | "tds" | undefined;
    order?: number | undefined;
}, {
    code?: string | undefined;
    type?: "earning" | "deduction" | "employer_contribution" | undefined;
    name?: string | undefined;
    calculationType?: "fixed" | "percentage_of_basic" | "percentage_of_gross" | undefined;
    isActive?: boolean | undefined;
    defaultValue?: number | undefined;
    isTaxable?: boolean | undefined;
    isStatutory?: boolean | undefined;
    statutoryType?: "pf_employee" | "pf_employer" | "esic_employee" | "esic_employer" | "professional_tax" | "tds" | undefined;
    order?: number | undefined;
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
    status?: "locked" | "draft" | "processing" | "processed" | "paid" | undefined;
    year?: number | undefined;
}, {
    status?: "locked" | "draft" | "processing" | "processed" | "paid" | undefined;
    page?: number | undefined;
    limit?: number | undefined;
    year?: number | undefined;
}>;
export declare function listCycles(req: Request, res: Response): Promise<void>;
export declare function createCycle(req: Request, res: Response): Promise<void>;
export declare function getCycle(req: Request, res: Response): Promise<void>;
export declare function processCycle(req: Request, res: Response): Promise<void>;
export declare function listCycleRecords(req: Request, res: Response): Promise<void>;
export declare const updateRecordSchema: z.ZodObject<{
    earnings: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        amount: number;
    }, {
        name: string;
        amount: number;
    }>, "many">>;
    deductions: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        amount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        amount: number;
    }, {
        name: string;
        amount: number;
    }>, "many">>;
    arrears: z.ZodOptional<z.ZodNumber>;
    reimbursements: z.ZodOptional<z.ZodNumber>;
    loanDeduction: z.ZodOptional<z.ZodNumber>;
    overtimeAmount: z.ZodOptional<z.ZodNumber>;
    overtimeHours: z.ZodOptional<z.ZodNumber>;
    expense: z.ZodOptional<z.ZodNumber>;
    advance: z.ZodOptional<z.ZodNumber>;
    lateDeduction: z.ZodOptional<z.ZodNumber>;
    paidLeaveBalance: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    expense?: number | undefined;
    overtimeHours?: number | undefined;
    earnings?: {
        name: string;
        amount: number;
    }[] | undefined;
    deductions?: {
        name: string;
        amount: number;
    }[] | undefined;
    arrears?: number | undefined;
    reimbursements?: number | undefined;
    loanDeduction?: number | undefined;
    overtimeAmount?: number | undefined;
    advance?: number | undefined;
    lateDeduction?: number | undefined;
    paidLeaveBalance?: number | undefined;
}, {
    expense?: number | undefined;
    overtimeHours?: number | undefined;
    earnings?: {
        name: string;
        amount: number;
    }[] | undefined;
    deductions?: {
        name: string;
        amount: number;
    }[] | undefined;
    arrears?: number | undefined;
    reimbursements?: number | undefined;
    loanDeduction?: number | undefined;
    overtimeAmount?: number | undefined;
    advance?: number | undefined;
    lateDeduction?: number | undefined;
    paidLeaveBalance?: number | undefined;
}>;
export declare function updateRecord(req: Request, res: Response): Promise<void>;
export declare function generatePayslips(req: Request, res: Response): Promise<void>;
export declare function lockCycle(req: Request, res: Response): Promise<void>;
export declare const markPaidSchema: z.ZodObject<{
    paymentRef: z.ZodString;
    paidAt: z.ZodOptional<z.ZodDate>;
}, "strip", z.ZodTypeAny, {
    paymentRef: string;
    paidAt?: Date | undefined;
}, {
    paymentRef: string;
    paidAt?: Date | undefined;
}>;
export declare function markCyclePaid(req: Request, res: Response): Promise<void>;
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