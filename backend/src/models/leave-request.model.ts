import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDayType = 'first_half' | 'second_half';

export interface ILeaveAttachment {
  name: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface ILeaveRequest extends Document {
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  startDate: Date;
  endDate: Date;
  days: number;
  isHalfDay: boolean;
  halfDayType?: HalfDayType;
  reason: string;
  attachments: ILeaveAttachment[];
  status: LeaveStatus;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  rejectedReason?: string;
  appliedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ILeaveAttachment>(
  {
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const leaveRequestSchema = new Schema<ILeaveRequest>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  days: { type: Number, required: true, min: 0 },
  isHalfDay: { type: Boolean, default: false },
  halfDayType: { type: String, enum: ['first_half', 'second_half'] },
  reason: { type: String, required: true, trim: true },
  attachments: { type: [attachmentSchema], default: [] },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
  },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  rejectedReason: { type: String },
  appliedAt: { type: Date, default: Date.now },
});
leaveRequestSchema.plugin(timestampPlugin);
leaveRequestSchema.plugin(softDeletePlugin);
leaveRequestSchema.plugin(paginatePlugin);

leaveRequestSchema.index({ employeeId: 1, status: 1 });
leaveRequestSchema.index({ startDate: 1, endDate: 1 });

export const LeaveRequest = model<ILeaveRequest, PaginateModel<ILeaveRequest> & Model<ILeaveRequest>>(
  'LeaveRequest',
  leaveRequestSchema,
);
