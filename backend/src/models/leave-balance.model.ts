import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface ILeaveBalance extends Document {
  employeeId: Types.ObjectId;
  leaveTypeId: Types.ObjectId;
  year: number;
  allocated: number;
  used: number;
  carried: number;
  adjusted: number;
  balance: number; // virtual: allocated + carried + adjusted - used
  createdAt: Date;
  updatedAt: Date;
}

const leaveBalanceSchema = new Schema<ILeaveBalance>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
  year: { type: Number, required: true },
  allocated: { type: Number, default: 0 },
  used: { type: Number, default: 0 },
  carried: { type: Number, default: 0 },
  adjusted: { type: Number, default: 0 },
});

leaveBalanceSchema.virtual('balance').get(function (this: ILeaveBalance) {
  return (this.allocated ?? 0) + (this.carried ?? 0) + (this.adjusted ?? 0) - (this.used ?? 0);
});

leaveBalanceSchema.set('toJSON', { virtuals: true });
leaveBalanceSchema.set('toObject', { virtuals: true });
leaveBalanceSchema.plugin(timestampPlugin);
leaveBalanceSchema.plugin(paginatePlugin);

leaveBalanceSchema.index(
  { employeeId: 1, leaveTypeId: 1, year: 1 },
  { unique: true },
);

export const LeaveBalance = model<ILeaveBalance, PaginateModel<ILeaveBalance> & Model<ILeaveBalance>>(
  'LeaveBalance',
  leaveBalanceSchema,
);
