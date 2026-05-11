import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const installmentSchema = new Schema({
    installmentNumber: { type: Number, required: true },
    dueDate: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    principalAmount: { type: Number, required: true, min: 0 },
    interestAmount: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidOn: { type: Date, default: null },
    status: {
        type: String,
        enum: ['scheduled', 'paid', 'partial', 'skipped', 'overdue'],
        default: 'scheduled',
    },
    notes: { type: String, trim: true },
}, { _id: true });
const loanSchema = new Schema({
    loanNumber: { type: String, required: true, trim: true, uppercase: true },
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
    type: {
        type: String,
        enum: ['salary_advance', 'personal_loan', 'emergency', 'education', 'medical', 'other'],
        default: 'personal_loan',
        index: true,
    },
    principalAmount: { type: Number, required: true, min: 1 },
    interestRate: { type: Number, required: true, min: 0, default: 0 },
    tenureMonths: { type: Number, required: true, min: 1, max: 360 },
    emiAmount: { type: Number, required: true, min: 0 },
    totalPayable: { type: Number, required: true, min: 0 },
    totalInterest: { type: Number, required: true, min: 0, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'approved', 'rejected', 'disbursed', 'active', 'closed', 'cancelled'],
        default: 'pending',
        index: true,
    },
    reason: { type: String, trim: true },
    appliedAt: { type: Date, required: true, default: () => new Date() },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedReason: { type: String, trim: true },
    disbursedOn: { type: Date, default: null },
    startMonth: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    installments: { type: [installmentSchema], default: [] },
    outstandingPrincipal: { type: Number, default: 0, min: 0 },
    outstandingTotal: { type: Number, default: 0, min: 0 },
    totalPaid: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
});
loanSchema.plugin(timestampPlugin);
loanSchema.plugin(softDeletePlugin);
loanSchema.plugin(paginatePlugin);
loanSchema.index({ loanNumber: 1 }, { unique: true });
loanSchema.index({ employee: 1, status: 1 });
loanSchema.index({ status: 1, 'installments.dueDate': 1 });
export const Loan = model('Loan', loanSchema);
//# sourceMappingURL=loan.model.js.map