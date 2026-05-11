import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const attachmentSchema = new Schema({
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: true });
const leaveRequestSchema = new Schema({
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
export const LeaveRequest = model('LeaveRequest', leaveRequestSchema);
//# sourceMappingURL=leave-request.model.js.map