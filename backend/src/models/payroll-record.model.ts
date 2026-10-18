import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

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

const lineSchema = new Schema<IPayrollLine>(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent' },
    name: { type: String, required: true },
    amount: { type: Number, default: 0 },
    statutoryType: { type: String, enum: ['pf', 'esi', 'pt', 'tds'] },
  },
  { _id: false },
);

const manualAdjustmentsSchema = new Schema<IPayrollManualAdjustments>(
  {
    arrears: { type: Number, default: null },
    advance: { type: Number, default: null },
    expense: { type: Number, default: null },
    reimbursements: { type: Number, default: null },
    loanDeduction: { type: Number, default: null },
    tds: { type: Number, default: null },
    note: { type: String },
  },
  { _id: false },
);

const computedFiguresSchema = new Schema<IPayrollComputedFigures>(
  {
    arrears: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    reimbursements: { type: Number, default: 0 },
    loanDeduction: { type: Number, default: 0 },
    tds: { type: Number, default: 0 },
  },
  { _id: false },
);

const settlementSchema = new Schema<IPayrollSettlement>(
  {
    loanInstallments: {
      type: [
        new Schema<IPayrollSettlementInstallment>(
          {
            loanId: { type: Schema.Types.ObjectId, ref: 'Loan', required: true },
            installmentId: { type: Schema.Types.ObjectId, required: true },
            amount: { type: Number, default: 0 },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
    claimIds: { type: [{ type: Schema.Types.ObjectId, ref: 'ExpenseClaim' }], default: [] },
    settledAt: { type: Date, default: null },
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
  tds: { type: Number, default: 0 },
  manualAdjustments: { type: manualAdjustmentsSchema, default: () => ({}) },
  computed: { type: computedFiguresSchema, default: () => ({}) },
  settlement: { type: settlementSchema, default: () => ({}) },
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
