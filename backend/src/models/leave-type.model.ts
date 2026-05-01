import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type LeaveGender = 'all' | 'male' | 'female';

export interface ILeaveType extends Document {
  name: string;
  code: string;
  daysAllowed: number;
  carryForward: { enabled: boolean; maxDays: number };
  encashable: boolean;
  paidLeave: boolean;
  applicableGender: LeaveGender;
  probationAllowed: boolean;
  halfDayAllowed: boolean;
  attachmentRequired: boolean;
  color: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const leaveTypeSchema = new Schema<ILeaveType>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  daysAllowed: { type: Number, required: true, min: 0, default: 0 },
  carryForward: {
    enabled: { type: Boolean, default: false },
    maxDays: { type: Number, default: 0 },
  },
  encashable: { type: Boolean, default: false },
  paidLeave: { type: Boolean, default: true },
  applicableGender: { type: String, enum: ['all', 'male', 'female'], default: 'all' },
  probationAllowed: { type: Boolean, default: false },
  halfDayAllowed: { type: Boolean, default: true },
  attachmentRequired: { type: Boolean, default: false },
  color: { type: String, default: '#3b82f6' },
  isActive: { type: Boolean, default: true },
});
leaveTypeSchema.plugin(timestampPlugin);
leaveTypeSchema.plugin(softDeletePlugin);
leaveTypeSchema.plugin(paginatePlugin);

leaveTypeSchema.index({ code: 1 }, { unique: true });

export const LeaveType = model<ILeaveType, PaginateModel<ILeaveType> & Model<ILeaveType>>(
  'LeaveType',
  leaveTypeSchema,
);
