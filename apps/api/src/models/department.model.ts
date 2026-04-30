import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type DepartmentStatus = 'active' | 'inactive';

export interface IDepartment extends Document {
  name: string;
  code: string;
  description?: string;
  head?: Types.ObjectId;
  parentDepartment?: Types.ObjectId;
  status: DepartmentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: { type: String },
  head: { type: Schema.Types.ObjectId, ref: 'Employee' },
  parentDepartment: { type: Schema.Types.ObjectId, ref: 'Department' },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
});
departmentSchema.plugin(timestampPlugin);
departmentSchema.plugin(softDeletePlugin);
departmentSchema.plugin(paginatePlugin);

departmentSchema.index({ code: 1 }, { unique: true });
departmentSchema.index({ parentDepartment: 1 });

export const Department = model<IDepartment, PaginateModel<IDepartment> & Model<IDepartment>>(
  'Department',
  departmentSchema,
);
