import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const orderItemSchema = new Schema({
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0 },
    total: { type: Number, required: true },
}, { _id: false });
const productOrderSchema = new Schema({
    orderNumber: { type: String, required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
    items: { type: [orderItemSchema], default: [] },
    subtotal: { type: Number, default: 0 },
    taxAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['draft', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'draft',
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
});
productOrderSchema.plugin(timestampPlugin);
productOrderSchema.plugin(softDeletePlugin);
productOrderSchema.plugin(paginatePlugin);
productOrderSchema.index({ orderNumber: 1 }, { unique: true });
productOrderSchema.index({ employeeId: 1, createdAt: -1 });
productOrderSchema.index({ clientId: 1, createdAt: -1 });
productOrderSchema.index({ status: 1 });
export const ProductOrder = model('ProductOrder', productOrderSchema);
//# sourceMappingURL=product-order.model.js.map