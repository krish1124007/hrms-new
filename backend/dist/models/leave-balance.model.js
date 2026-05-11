import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const leaveBalanceSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    leaveTypeId: { type: Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    allocated: { type: Number, default: 0 },
    used: { type: Number, default: 0 },
    carried: { type: Number, default: 0 },
    adjusted: { type: Number, default: 0 },
});
leaveBalanceSchema.virtual('balance').get(function () {
    return (this.allocated ?? 0) + (this.carried ?? 0) + (this.adjusted ?? 0) - (this.used ?? 0);
});
leaveBalanceSchema.set('toJSON', { virtuals: true });
leaveBalanceSchema.set('toObject', { virtuals: true });
leaveBalanceSchema.plugin(timestampPlugin);
leaveBalanceSchema.plugin(paginatePlugin);
leaveBalanceSchema.index({ employeeId: 1, leaveTypeId: 1, year: 1 }, { unique: true });
export const LeaveBalance = model('LeaveBalance', leaveBalanceSchema);
//# sourceMappingURL=leave-balance.model.js.map