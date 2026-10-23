import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const receiptSchema = new Schema({
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: true });
const travelSchema = new Schema({
    date: { type: String, required: true },
    vehicleType: { type: String, enum: ['bike', 'car', 'other'], required: true },
    ratePerKm: { type: Number, required: true, min: 0 },
    computedKm: { type: Number, required: true, min: 0 },
    claimedKm: { type: Number, required: true, min: 0 },
    estimated: { type: Boolean, default: false },
    reason: String,
    points: {
        type: [
            {
                lat: Number,
                lng: Number,
                at: Date,
                kind: { type: String, enum: ['day_in', 'visit_in', 'visit_out', 'day_out'] },
                siteName: String,
                _id: false,
            },
        ],
        default: [],
    },
    legs: {
        type: [{ fromIndex: Number, toIndex: Number, distanceM: Number, estimated: Boolean, _id: false }],
        default: [],
    },
}, { _id: false });
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
    payrollCycleId: { type: Schema.Types.ObjectId, ref: 'PayrollCycle' },
    travel: { type: travelSchema, default: undefined },
    travelKey: { type: String, select: false },
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit' },
});
expenseClaimSchema.plugin(timestampPlugin);
expenseClaimSchema.plugin(softDeletePlugin);
expenseClaimSchema.plugin(paginatePlugin);
expenseClaimSchema.index({ employeeId: 1, status: 1 });
expenseClaimSchema.index({ date: -1 });
// One live travel claim per employee per day (production: migration 20261023000005).
expenseClaimSchema.index({ travelKey: 1 }, { unique: true, name: 'travelKey_1', partialFilterExpression: { travelKey: { $exists: true } } });
export const ExpenseClaim = model('ExpenseClaim', expenseClaimSchema);
//# sourceMappingURL=expense-claim.model.js.map