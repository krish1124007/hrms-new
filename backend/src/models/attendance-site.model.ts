import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface ISiteLocation {
  lat: number;
  lng: number;
}

export interface IAttendanceSite extends Document {
  name: string;
  address?: string;
  location: ISiteLocation;
  radius: number; // meters
  assignedEmployees: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<ISiteLocation>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const attendanceSiteSchema = new Schema<IAttendanceSite>({
  name: { type: String, required: true, trim: true },
  address: { type: String },
  location: { type: locationSchema, required: true },
  radius: { type: Number, default: 100 },
  assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
  isActive: { type: Boolean, default: true },
});
attendanceSiteSchema.plugin(timestampPlugin);
attendanceSiteSchema.plugin(softDeletePlugin);
attendanceSiteSchema.plugin(paginatePlugin);

attendanceSiteSchema.index({ name: 1 });

export const AttendanceSite = model<
  IAttendanceSite,
  PaginateModel<IAttendanceSite> & Model<IAttendanceSite>
>('AttendanceSite', attendanceSiteSchema);
