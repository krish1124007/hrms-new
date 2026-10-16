import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type PayrollCycleStatus = 'draft' | 'processing' | 'processed' | 'paid' | 'locked';
export interface IPayrollCycle extends Document {
    month: number;
    year: number;
    status: PayrollCycleStatus;
    processedBy?: Types.ObjectId;
    processedAt?: Date;
    totalGross: number;
    totalDeductions: number;
    totalNet: number;
    employeeCount: number;
    payslipGeneratedAt?: Date;
    paidAt?: Date;
    paymentRef?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PayrollCycle: PaginateModel<IPayrollCycle> & Model<IPayrollCycle, {}, {}, {}, Document<unknown, {}, IPayrollCycle, {}, {}> & IPayrollCycle & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=payroll-cycle.model.d.ts.map