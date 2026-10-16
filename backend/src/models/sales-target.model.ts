import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type TargetType = 'amount' | 'quantity' | 'visits';
export type TargetStatus = 'on_track' | 'behind' | 'exceeded';

export interface ITargetMilestone {
  value: number;
  reward?: string;
  achieved: boolean;
}

export interface ISalesTarget extends Document {
  employeeId: Types.ObjectId;
  period: { month: number; year: number };
  type: TargetType;
  productCategory?: string;
  targetValue: number;
  achievedValue: number;
  status: TargetStatus;
  milestones: ITargetMilestone[];
  createdAt: Date;
  updatedAt: Date;
}

const milestoneSchema = new Schema<ITargetMilestone>(
  {
    value: { type: Number, required: true },
    reward: String,
    achieved: { type: Boolean, default: false },
  },
  { _id: false },
);

const salesTargetSchema = new Schema<ISalesTarget>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  period: {
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true },
  },
  type: { type: String, enum: ['amount', 'quantity', 'visits'], default: 'amount' },
  productCategory: String,
  targetValue: { type: Number, required: true },
  achievedValue: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['on_track', 'behind', 'exceeded'],
    default: 'on_track',
  },
  milestones: { type: [milestoneSchema], default: [] },
});

salesTargetSchema.virtual('percentage').get(function (this: ISalesTarget) {
  if (!this.targetValue) return 0;
  return Math.round((this.achievedValue / this.targetValue) * 100);
});
salesTargetSchema.set('toJSON', { virtuals: true });
salesTargetSchema.set('toObject', { virtuals: true });
salesTargetSchema.plugin(timestampPlugin);
salesTargetSchema.plugin(softDeletePlugin);
salesTargetSchema.plugin(paginatePlugin);

salesTargetSchema.index(
  { employeeId: 1, 'period.year': 1, 'period.month': 1, type: 1 },
  { unique: true },
);

export const SalesTarget = model<
  ISalesTarget,
  PaginateModel<ISalesTarget> & Model<ISalesTarget>
>('SalesTarget', salesTargetSchema);
