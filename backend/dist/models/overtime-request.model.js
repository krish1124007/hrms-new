import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const overtimeSchema = new Schema({
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
export const OvertimeRequest = model('OvertimeRequest', overtimeSchema);
//# sourceMappingURL=overtime-request.model.js.map