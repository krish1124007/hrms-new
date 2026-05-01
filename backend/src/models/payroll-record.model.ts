import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

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

const lineSchema = new Schema<IPayrollLine>(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent' },
    name: { type: String, required: true },
    amount: { type: Number, default: 0 },
  },
  { _id: false },
);

const bankSchema = new Schema<IPayrollBank>(
  {
    bankName: String,
    accountNumber: String,
    ifscCode: String,
  },
  { _id: false },
);

const payrollRecordSchema = new Schema<IPayrollRecord>({
  cycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle', required: true, index: true },
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  earnings: { type: [lineSchema], default: [] },
  deductions: { type: [lineSchema], default: [] },
  employerContributions: { type: [lineSchema], default: [] },
  fullMonthGross: { type: Number, default: 0 },
  grossSalary: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  netSalary: { type: Number, default: 0 },
  workingDays: { type: Number, default: 0 },
  daysPaid: { type: Number, default: 0 },
  presentDays: { type: Number, default: 0 },
  absentDays: { type: Number, default: 0 },
  lopDays: { type: Number, default: 0 },
  lopAmount: { type: Number, default: 0 },
  paidLeaveDays: { type: Number, default: 0 },
  weeklyOffDays: { type: Number, default: 0 },
  unpaidDays: { type: Number, default: 0 },
  lateLoginCount: { type: Number, default: 0 },
  paidLeaveBalance: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  overtimeAmount: { type: Number, default: 0 },
  expense: { type: Number, default: 0 },
  advance: { type: Number, default: 0 },
  lateDeduction: { type: Number, default: 0 },
  arrears: { type: Number, default: 0 },
  reimbursements: { type: Number, default: 0 },
  loanDeduction: { type: Number, default: 0 },
  payslipUrl: String,
  paymentStatus: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  paymentRef: String,
  paidAt: Date,
  bankDetails: { type: bankSchema, default: () => ({}) },
});
payrollRecordSchema.plugin(timestampPlugin);
payrollRecordSchema.plugin(softDeletePlugin);
payrollRecordSchema.plugin(paginatePlugin);

payrollRecordSchema.index({ cycleId: 1, employeeId: 1 }, { unique: true });

export const PayrollRecord = model<
  IPayrollRecord,
  PaginateModel<IPayrollRecord> & Model<IPayrollRecord>
>('PayrollRecord', payrollRecordSchema);
