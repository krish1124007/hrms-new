import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface IAllowedIP extends Document {
  label: string;
  ipAddress?: string;
  ipRangeStart?: string;
  ipRangeEnd?: string;
  locationId?: Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const allowedIPSchema = new Schema<IAllowedIP>({
  label: { type: String, required: true, trim: true },
  ipAddress: { type: String },
  ipRangeStart: { type: String },
  ipRangeEnd: { type: String },
  locationId: { type: Schema.Types.ObjectId, ref: 'AttendanceSite' },
  isActive: { type: Boolean, default: true },
});
allowedIPSchema.plugin(timestampPlugin);
allowedIPSchema.plugin(softDeletePlugin);
allowedIPSchema.plugin(paginatePlugin);

allowedIPSchema.index({ label: 1 });
allowedIPSchema.index({ ipAddress: 1 });

export const AllowedIP = model<IAllowedIP, PaginateModel<IAllowedIP> & Model<IAllowedIP>>(
  'AllowedIP',
  allowedIPSchema,
);
