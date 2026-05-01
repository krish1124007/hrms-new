import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type ComponentType = 'earning' | 'deduction' | 'employer_contribution';
export type CalculationType = 'fixed' | 'percentage_of_basic' | 'percentage_of_gross';
export type StatutoryType =
  | 'pf_employee'
  | 'pf_employer'
  | 'esic_employee'
  | 'esic_employer'
  | 'professional_tax'
  | 'tds';

export interface ISalaryComponent extends Document {
  name: string;
  code: string;
  type: ComponentType;
  calculationType: CalculationType;
  defaultValue: number;
  isTaxable: boolean;
  isStatutory: boolean;
  statutoryType?: StatutoryType;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const salaryComponentSchema = new Schema<ISalaryComponent>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  type: {
    type: String,
    enum: ['earning', 'deduction', 'employer_contribution'],
    required: true,
  },
  calculationType: {
    type: String,
    enum: ['fixed', 'percentage_of_basic', 'percentage_of_gross'],
    default: 'fixed',
  },
  defaultValue: { type: Number, default: 0 },
  isTaxable: { type: Boolean, default: false },
  isStatutory: { type: Boolean, default: false },
  statutoryType: {
    type: String,
    enum: ['pf_employee', 'pf_employer', 'esic_employee', 'esic_employer', 'professional_tax', 'tds'],
  },
  order: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
});
salaryComponentSchema.plugin(timestampPlugin);
salaryComponentSchema.plugin(softDeletePlugin);
salaryComponentSchema.plugin(paginatePlugin);

salaryComponentSchema.index({ code: 1 }, { unique: true });

export const SalaryComponent = model<
  ISalaryComponent,
  PaginateModel<ISalaryComponent> & Model<ISalaryComponent>
>('SalaryComponent', salaryComponentSchema);
