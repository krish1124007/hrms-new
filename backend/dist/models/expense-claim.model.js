import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const receiptSchema = new Schema({
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: true });
const expenseClaimSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    category: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    amount: { type: Number, required: true, min: 0 },
    acceptedAmount: { type: Number, min: 0 },
    currency: { type: String, default: 'INR' },
    date: { type: Date, required: true },
    description: { type: String },
    receiptUrls: { type: [receiptSchema], default: [] },
    paymentMethod: {
        type: String,
        enum: ['cash', 'bank', 'card', 'upi', 'cheque', 'other'],
    },
    status: {
        type: String,
        enum: ['draft', 'pending', 'approved', 'rejected', 'reimbursed'],
        default: 'pending',
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedReason: { type: String },
    reimbursedAt: { type: Date },
    reimbursementRef: { type: String },
});
expenseClaimSchema.plugin(timestampPlugin);
expenseClaimSchema.plugin(softDeletePlugin);
expenseClaimSchema.plugin(paginatePlugin);
expenseClaimSchema.index({ employeeId: 1, status: 1 });
expenseClaimSchema.index({ date: -1 });
export const ExpenseClaim = model('ExpenseClaim', expenseClaimSchema);
//# sourceMappingURL=expense-claim.model.js.map