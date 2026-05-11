import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const paymentCollectionSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    amount: { type: Number, required: true, min: 0 },
    method: {
        type: String,
        enum: ['cash', 'cheque', 'upi', 'bank_transfer', 'other'],
        required: true,
    },
    reference: String,
    collectedAt: { type: Date, default: Date.now },
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit' },
    orderId: { type: Schema.Types.ObjectId, ref: 'ProductOrder' },
    receiptNumber: { type: String, required: true },
    notes: String,
    status: {
        type: String,
        enum: ['collected', 'deposited', 'verified', 'bounced'],
        default: 'collected',
    },
    depositedAt: Date,
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
paymentCollectionSchema.plugin(timestampPlugin);
paymentCollectionSchema.plugin(softDeletePlugin);
paymentCollectionSchema.plugin(paginatePlugin);
paymentCollectionSchema.index({ receiptNumber: 1 }, { unique: true });
paymentCollectionSchema.index({ employeeId: 1, collectedAt: -1 });
paymentCollectionSchema.index({ clientId: 1, collectedAt: -1 });
paymentCollectionSchema.index({ status: 1 });
export const PaymentCollection = model('PaymentCollection', paymentCollectionSchema);
//# sourceMappingURL=payment-collection.model.js.map