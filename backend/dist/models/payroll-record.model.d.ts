import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IPayrollLine {
    componentId?: Types.ObjectId;
    name: string;
    amount: number;
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