import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface IExpenseCategory extends Document {
  name: string;
  code: string;
  description?: string;
  limit?: number;
  requiresReceipt: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const expenseCategorySchema = new Schema<IExpenseCategory>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String },
  limit: { type: Number, min: 0 },
  requiresReceipt: { type: Boolean, default: true },
  isActive: { type: Boolean, default: true },
});
expenseCategorySchema.plugin(timestampPlugin);
expenseCategorySchema.plugin(softDeletePlugin);
expenseCategorySchema.plugin(paginatePlugin);

expenseCategorySchema.index({ code: 1 }, { unique: true });

export const ExpenseCategory = model<
  IExpenseCategory,
  PaginateModel<IExpenseCategory> & Model<IExpenseCategory>
>('ExpenseCategory', expenseCategorySchema);
