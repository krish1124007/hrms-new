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

export type TravelVehicleType = 'bike' | 'car' | 'other';

/** A point of the travelled day, as the route showed it when the claim was made. */
export interface IExpenseTravelPoint {
  lat: number;
  lng: number;
  at: Date;
  kind: 'day_in' | 'visit_in' | 'visit_out' | 'day_out';
  siteName?: string;
}

/**
 * How a travel allowance claim (`POST /field/travel/claims`) was worked out:
 * the km measured between the day's check-in/out points (`computedKm`, with
 * the route's points and legs kept for the approver), the km claimed and why
 * they differ, and the vehicle's rate. `amount = round(claimedKm × ratePerKm)`.
 */
export interface IExpenseTravel {
  /** IST calendar day travelled, `YYYY-MM-DD`. */
  date: string;
  vehicleType: TravelVehicleType;
  ratePerKm: number;
  computedKm: number;
  claimedKm: number;
  /** Some leg used the straight-line × 1.3 estimate (no road distance). */
  estimated: boolean;
  reason?: string;
  points: IExpenseTravelPoint[];
  legs: { fromIndex: number; toIndex: number; distanceM: number; estimated: boolean }[];
}

export interface IExpenseClaim extends Document {
  employeeId: Types.ObjectId;
  category: Types.ObjectId;
  amount: number;
  acceptedAmount?: number;
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
  /** The payroll cycle that paid this claim out, when payroll reimbursed it. */
  payrollCycleId?: Types.ObjectId;
  /** Set on travel allowance claims. */
  travel?: IExpenseTravel;
  /**
   * `<employeeId>:<YYYY-MM-DD>` while a travel claim is live (not rejected,
   * not deleted) — unique, so one employee has one travel claim per day.
   */
  travelKey?: string;
  /** The field visit this expense was incurred at. */
  visitId?: Types.ObjectId;
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

const travelSchema = new Schema<IExpenseTravel>(
  {
    date: { type: String, required: true },
    vehicleType: { type: String, enum: ['bike', 'car', 'other'], required: true },
    ratePerKm: { type: Number, required: true, min: 0 },
    computedKm: { type: Number, required: true, min: 0 },
    claimedKm: { type: Number, required: true, min: 0 },
    estimated: { type: Boolean, default: false },
    reason: String,
    points: {
      type: [
        {
          lat: Number,
          lng: Number,
          at: Date,
          kind: { type: String, enum: ['day_in', 'visit_in', 'visit_out', 'day_out'] },
          siteName: String,
          _id: false,
        },
      ],
      default: [],
    },
    legs: {
      type: [{ fromIndex: Number, toIndex: Number, distanceM: Number, estimated: Boolean, _id: false }],
      default: [],
    },
  },
  { _id: false },
);

const expenseClaimSchema = new Schema<IExpenseClaim>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
  amount: { type: Number, required: true, min: 0 },
  acceptedAmount: { type: Number, min: 0 },
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
  payrollCycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle' },
  travel: { type: travelSchema, default: undefined },
  travelKey: { type: String, select: false },
  visitId: { type: Schema.Types.ObjectId, ref: 'Visit' },
});
expenseClaimSchema.plugin(timestampPlugin);
expenseClaimSchema.plugin(softDeletePlugin);
expenseClaimSchema.plugin(paginatePlugin);

expenseClaimSchema.index({ employeeId: 1, status: 1 });
expenseClaimSchema.index({ date: -1 });
// One live travel claim per employee per day (production: migration 20261023000005).
expenseClaimSchema.index(
  { travelKey: 1 },
  { unique: true, name: 'travelKey_1', partialFilterExpression: { travelKey: { $exists: true } } },
);

export const ExpenseClaim = model<IExpenseClaim, PaginateModel<IExpenseClaim> & Model<IExpenseClaim>>(
  'ExpenseClaim',
  expenseClaimSchema,
);
