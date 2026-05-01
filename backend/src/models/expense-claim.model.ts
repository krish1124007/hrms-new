import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type ExpenseClaimStatus =
  | 'draft'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'reimbursed';

export type ExpensePaymentMethod = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'other';

export interface IExpenseReceipt {
  name: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface IExpenseClaim extends Document {
  employeeId: Types.ObjectId;
  category: Types.ObjectId;
  amount: number;
  currency: string;
  date: Date;
  description?: string;
  receiptUrls: IExpenseReceipt[];
  paymentMethod?: ExpensePaymentMethod;
  status: ExpenseClaimStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedReason?: string;
  reimbursedAt?: Date;
  reimbursementRef?: string;
  createdAt: Date;
  updatedAt: Date;
}

const receiptSchema = new Schema<IExpenseReceipt>(
  {
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const expenseClaimSchema = new Schema<IExpenseClaim>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: 'INR' },
  date: { type: Date, required: true },
  description: { type: String },
  receiptUrls: { type: [receiptSchema], default: [] },
  paymentMethod: {
    type: String,
    enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'other'],
  },
  status: {
    type: String,
    enum: ['draft', 'pending', 'approved', 'rejected', 'reimbursed'],
    default: 'pending',
  },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedReason: { type: String },
  reimbursedAt: { type: Date },
  reimbursementRef: { type: String },
});
expenseClaimSchema.plugin(timestampPlugin);
expenseClaimSchema.plugin(softDeletePlugin);
expenseClaimSchema.plugin(paginatePlugin);

expenseClaimSchema.index({ employeeId: 1, status: 1 });
expenseClaimSchema.index({ date: -1 });

export const ExpenseClaim = model<IExpenseClaim, PaginateModel<IExpenseClaim> & Model<IExpenseClaim>>(
  'ExpenseClaim',
  expenseClaimSchema,
);
