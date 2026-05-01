import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';
import type { CalculationType } from './salary-component.model.js';

export interface IStructureComponent {
  componentId: Types.ObjectId;
  calculationType: CalculationType;
  value: number;
}

export interface ISalaryStructure extends Document {
  name: string;
  components: IStructureComponent[];
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const structureComponentSchema = new Schema<IStructureComponent>(
  {
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent', required: true },
    calculationType: {
      type: String,
      enum: ['fixed', 'percentage_of_basic', 'percentage_of_gross'],
      default: 'fixed',
    },
    value: { type: Number, default: 0 },
  },
  { _id: false },
);

const salaryStructureSchema = new Schema<ISalaryStructure>({
  name: { type: String, required: true, trim: true },
  components: { type: [structureComponentSchema], default: [] },
  isDefault: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
});
salaryStructureSchema.plugin(timestampPlugin);
salaryStructureSchema.plugin(softDeletePlugin);
salaryStructureSchema.plugin(paginatePlugin);

salaryStructureSchema.index({ name: 1 }, { unique: true });

export const SalaryStructure = model<
  ISalaryStructure,
  PaginateModel<ISalaryStructure> & Model<ISalaryStructure>
>('SalaryStructure', salaryStructureSchema);
