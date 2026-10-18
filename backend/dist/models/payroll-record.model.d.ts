import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/** Which statutory deduction a line is, so payroll can find/override it by type not by name. */
export type PayrollStatutoryType = 'pf' | 'esi' | 'pt' | 'tds';
export interface IPayrollLine {
    componentId?: Types.ObjectId;
    name: string;
    amount: number;
    statutoryType?: PayrollStatutoryType;
}
/**
 * HR overrides applied on top of the computed figures. `null` means "not
 * overridden — use the computed value"; a number (including 0) replaces it.
 */
export interface IPayrollManualAdjustments {
    arrears: number | null;
    advance: number | null;
    expense: number | null;
    reimbursements: number | null;
    loanDeduction: number | null;
    tds: number | null;
    note?: string;
}
/**
 * The figures payroll computed for the overridable fields, before any HR
 * override — what a field goes back to when its override is cleared.
 */
export interface IPayrollComputedFigures {
    arrears: number;
    advance: number;
    expense: number;
    reimbursements: number;
    loanDeduction: number;
    tds: number;
}
/** A loan instalment the record's loan deduction counted, and the amount it counted. */
export interface IPayrollSettlementInstallment {
    loanId: Types.ObjectId;
    installmentId: Types.ObjectId;
    amount: number;
}
/**
 * What the record counted, so paying the cycle settles exactly that: the loan
 * instalments behind `loanDeduction` and the expense claims behind
 * `reimbursements`, in the order they are settled. From processing until
 * `settledAt` the record HOLDS these items (unless its cycle is a draft): no
 * other cycle counts them and they cannot be paid by hand.
 */
export interface IPayrollSettlement {
    loanInstallments: IPayrollSettlementInstallment[];
    claimIds: Types.ObjectId[];
    /** When `settleCycle` settled this record (after the cycle was paid). */
    settledAt?: Date | null;
}
export interface IPayrollBank {
    bankName?: string;
    accountNumber?: string;
    ifscCode?: string;
}
export type PayrollPaymentStatus = 'pending' | 'paid';
export interface IPayrollRecord extends Document {
    cycleId: Types.ObjectId;
    employeeId: Types.ObjectId;
    earnings: IPayrollLine[];
    deductions: IPayrollLine[];
    employerContributions: IPayrollLine[];
    /** Full-month entitlement (basic+hra+other before any proration). */
    fullMonthGross: number;
    grossSalary: number;
    totalDeductions: number;
    netSalary: number;
    workingDays: number;
    daysPaid: number;
    presentDays: number;
    absentDays: number;
    lopDays: number;
    lopAmount: number;
    paidLeaveDays: number;
    weeklyOffDays: number;
    unpaidDays: number;
    lateLoginCount: number;
    paidLeaveBalance: number;
    overtimeHours: number;
    overtimeAmount: number;
    expense: number;
    advance: number;
    lateDeduction: number;
    arrears: number;
    reimbursements: number;
    loanDeduction: number;
    tds: number;
    manualAdjustments: IPayrollManualAdjustments;
    computed: IPayrollComputedFigures;
    settlement: IPayrollSettlement;
    payslipUrl?: string;
    paymentStatus: PayrollPaymentStatus;
    paymentRef?: string;
    paidAt?: Date;
    bankDetails: IPayrollBank;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PayrollRecord: PaginateModel<IPayrollRecord> & Model<IPayrollRecord, {}, {}, {}, Document<unknown, {}, IPayrollRecord, {}, {}> & IPayrollRecord & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=payroll-record.model.d.ts.map