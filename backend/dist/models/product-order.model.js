import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const orderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    sku: String,
    unit: String,
    category: String,
    hsnCode: String,
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discountPercent: { type: Number, min: 0, max: 100 },
    gstRate: Number,
    lineSubtotal: Number,
    lineGst: Number,
    lineTotal: Number,
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
}, { _id: false });
const productOrderSchema = new Schema({
    orderNumber: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    discountTotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'delivered', 'cancelled', 'draft', 'processing', 'shipped'],
        default: 'pending',
    },
    deliveryDate: Date,
    notes: String,
    visitId: { type: Schema.Types.ObjectId, ref: 'Visit' },
    paymentStatus: {
        type: String,
        enum: ['pending', 'partial', 'paid'],
        default: 'pending',
    },
    paidAmount: { type: Number, default: 0 },
    confirmedAt: Date,
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    deliveredAt: Date,
    deliveredBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
// API names for the stored totals (`taxAmount`/`totalAmount` stay the stored
// fields: the ledger, targets and reports aggregate on them, legacy rows too).
productOrderSchema.virtual('gstTotal').get(function () {
    return this.taxAmount ?? 0;
});
productOrderSchema.virtual('total').get(function () {
    return this.totalAmount ?? 0;
});
productOrderSchema.set('toJSON', { virtuals: true });
productOrderSchema.set('toObject', { virtuals: true });
productOrderSchema.plugin(timestampPlugin);
productOrderSchema.plugin(softDeletePlugin);
productOrderSchema.plugin(paginatePlugin);
productOrderSchema.index({ orderNumber: 1 }, { unique: true });
productOrderSchema.index({ employeeId: 1, createdAt: -1 });
productOrderSchema.index({ clientId: 1, createdAt: -1 });
productOrderSchema.index({ status: 1 });
export const ProductOrder = model('ProductOrder', productOrderSchema);
//# sourceMappingURL=product-order.model.js.map