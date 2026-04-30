import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface IOvertimeRequest extends Document {
  employee: Types.ObjectId;
  date: Date;
  hours: number;
  reason: string;
  status: OvertimeStatus;
  appliedAt: Date;
  approvedBy?: Types.ObjectId | null;
  approvedAt?: Date | null;
  approverNotes?: string;
  rejectedReason?: string;
  /** Link to the payroll record once it's been counted toward a cycle. */
  payrollRecordId?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const overtimeSchema = new Schema<IOvertimeRequest>({
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  date: { type: Date, required: true, index: true },
  hours: { type: Number, required: true, min: 0.01, max: 24 },
  reason: { type: String, required: true, trim: true },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending',
    index: true,
  },
  appliedAt: { type: Date, required: true, default: () => new Date() },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  approvedAt: { type: Date, default: null },
  approverNotes: { type: String, trim: true },
  rejectedReason: { type: String, trim: true },
  payrollRecordId: { type: Schema.Types.ObjectId, ref: 'PayrollRecord', default: null },
});

overtimeSchema.plugin(timestampPlugin);
overtimeSchema.plugin(softDeletePlugin);
overtimeSchema.plugin(paginatePlugin);

overtimeSchema.index({ employee: 1, date: 1 });
overtimeSchema.index({ status: 1, date: 1 });

export const OvertimeRequest = model<
  IOvertimeRequest,
  PaginateModel<IOvertimeRequest> & Model<IOvertimeRequest>
>('OvertimeRequest', overtimeSchema);
