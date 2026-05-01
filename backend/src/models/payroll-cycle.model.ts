import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

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

const payrollCycleSchema = new Schema<IPayrollCycle>({
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2000 },
  status: {
    type: String,
    enum: ['draft', 'processing', 'processed', 'paid', 'locked'],
    default: 'draft',
  },
  processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  processedAt: Date,
  totalGross: { type: Number, default: 0 },
  totalDeductions: { type: Number, default: 0 },
  totalNet: { type: Number, default: 0 },
  employeeCount: { type: Number, default: 0 },
  payslipGeneratedAt: Date,
  paidAt: Date,
  paymentRef: String,
});
payrollCycleSchema.plugin(timestampPlugin);
payrollCycleSchema.plugin(softDeletePlugin);
payrollCycleSchema.plugin(paginatePlugin);

payrollCycleSchema.index({ year: 1, month: 1 }, { unique: true });

export const PayrollCycle = model<
  IPayrollCycle,
  PaginateModel<IPayrollCycle> & Model<IPayrollCycle>
>('PayrollCycle', payrollCycleSchema);
