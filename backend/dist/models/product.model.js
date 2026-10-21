import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
/** GST slabs a product may carry, in percent. */
export const GST_RATES = [0, 5, 12, 18, 28];
const productSchema = new Schema({
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 64 },
    category: { type: String, required: true, trim: true, maxlength: 100 },
    unit: { type: String, required: true, trim: true, default: 'pcs', maxlength: 20 },
    price: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, enum: GST_RATES, default: 18 },
    hsnCode: { type: String, trim: true, maxlength: 20 },
    description: { type: String, trim: true, maxlength: 2000 },
    isActive: { type: Boolean, default: true },
});
// The mobile app reads the GST rate as `taxRate`.
productSchema.virtual('taxRate').get(function () {
    return this.gstRate;
});
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });
productSchema.plugin(timestampPlugin);
productSchema.plugin(softDeletePlugin);
productSchema.plugin(paginatePlugin);
// One live product per SKU; a soft-deleted product frees its SKU.
// Production builds indexes by hand (autoIndex is off) — see the deploy checklist.
productSchema.index({ sku: 1 }, { unique: true, name: 'sku_unique_live', partialFilterExpression: { isDeleted: false } });
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 1 });
export const Product = model('Product', productSchema);
//# sourceMappingURL=product.model.js.map