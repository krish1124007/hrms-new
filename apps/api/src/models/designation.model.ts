import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface IDesignation extends Document {
  name: string;
  department?: Types.ObjectId;
  level: number;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const designationSchema = new Schema<IDesignation>({
  name: { type: String, required: true, trim: true },
  department: { type: Schema.Types.ObjectId, ref: 'Department' },
  level: { type: Number, default: 1 },
  description: { type: String },
});
designationSchema.plugin(timestampPlugin);
designationSchema.plugin(softDeletePlugin);
designationSchema.plugin(paginatePlugin);

designationSchema.index({ name: 1, department: 1 }, { unique: true });

export const Designation = model<IDesignation, PaginateModel<IDesignation> & Model<IDesignation>>(
  'Designation',
  designationSchema,
);
