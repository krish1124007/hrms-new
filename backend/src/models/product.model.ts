import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

/** GST slabs a product may carry, in percent. */
export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/**
 * The field-sales product catalogue. Orders copy name/SKU/unit/price/GST rate
 * onto each line when they are booked, so later catalogue edits never change
 * an existing order.
 */
export interface IProduct extends Document {
  name: string;
  /** Stored upper-cased; unique among non-deleted products. */
  sku: string;
  category: string;
  unit: string;
  /** Unit price before GST, in rupees. */
  price: number;
  gstRate: GstRate;
  hsnCode?: string;
  description?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>({
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
productSchema.virtual('taxRate').get(function (this: IProduct) {
  return this.gstRate;
});
productSchema.set('toJSON', { virtuals: true });
productSchema.set('toObject', { virtuals: true });

productSchema.plugin(timestampPlugin);
productSchema.plugin(softDeletePlugin);
productSchema.plugin(paginatePlugin);

// One live product per SKU; a soft-deleted product frees its SKU.
// Production builds indexes by hand (autoIndex is off) — see the deploy checklist.
productSchema.index(
  { sku: 1 },
  { unique: true, name: 'sku_unique_live', partialFilterExpression: { isDeleted: false } },
);
productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 1 });

export const Product = model<IProduct, PaginateModel<IProduct> & Model<IProduct>>('Product', productSchema);
