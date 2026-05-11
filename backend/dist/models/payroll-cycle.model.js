import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const payrollCycleSchema = new Schema({
    month: { type: Number, required: true, min: 1, max: 12 },
    year: { type: Number, required: true, min: 2000 },
    status: {
        type: String,
        enum: ['draft', 'processing', 'processed', 'paid', 'locked'],
        default: 'draft',
    },
    processedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    processedAt: Date,
    totalGross: { type: Number, default: 0 },
    totalDeductions: { type: Number, default: 0 },
    totalNet: { type: Number, default: 0 },
    employeeCount: { type: Number, default: 0 },
    payslipGeneratedAt: Date,
    paidAt: Date,
    paymentRef: String,
});
payrollCycleSchema.plugin(timestampPlugin);
payrollCycleSchema.plugin(softDeletePlugin);
payrollCycleSchema.plugin(paginatePlugin);
payrollCycleSchema.index({ year: 1, month: 1 }, { unique: true });
export const PayrollCycle = model('PayrollCycle', payrollCycleSchema);
//# sourceMappingURL=payroll-cycle.model.js.map