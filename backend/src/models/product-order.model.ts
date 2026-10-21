import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

/**
 * `pending → confirmed → delivered`, `pending | confirmed → cancelled`
 * (controllers/field-orders.controller.ts). `draft`, `processing` and
 * `shipped` are legacy values older orders may still carry: `draft` behaves as
 * `pending`, `processing`/`shipped` as `confirmed`.
 */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'delivered'
  | 'cancelled'
  | 'draft'
  | 'processing'
  | 'shipped';
export type OrderPaymentStatus = 'pending' | 'partial' | 'paid';

/**
 * One order line. Catalogue lines (every order booked since the product
 * catalogue) carry the product snapshot and the GST breakdown; legacy
 * free-text lines only have name/quantity/unitPrice/discount/total.
 *
 *   lineSubtotal = quantity × unitPrice × (1 − discountPercent / 100)
 *   lineGst      = lineSubtotal × gstRate / 100
 *   lineTotal    = lineSubtotal + lineGst                (each paise-rounded)
 *
 * `discount` mirrors `discountPercent` and `total` mirrors `lineTotal` so
 * readers of the old shape keep working.
 */
export interface IOrderItem {
  productId?: Types.ObjectId;
  name: string;
  sku?: string;
  unit?: string;
  category?: string;
  hsnCode?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  gstRate?: number;
  lineSubtotal?: number;
  lineGst?: number;
  lineTotal?: number;
  discount: number;
  total: number;
}

export interface IProductOrder extends Document {
  orderNumber: string;
  employeeId: Types.ObjectId;
  clientId: Types.ObjectId;
  items: IOrderItem[];
  /** Σ lineSubtotal — after discounts, before GST. */
  subtotal: number;
  /** Σ (quantity × unitPrice) − subtotal. */
  discountTotal: number;
  /** Σ lineGst. Exposed as `gstTotal` too. */
  taxAmount: number;
  /** subtotal + taxAmount — the receivable. Exposed as `total` too. */
  totalAmount: number;
  status: OrderStatus;
  deliveryDate?: Date;
  notes?: string;
  visitId?: Types.ObjectId;
  paymentStatus: OrderPaymentStatus;
  paidAmount: number;
  confirmedAt?: Date;
  confirmedBy?: Types.ObjectId;
  deliveredAt?: Date;
  deliveredBy?: Types.ObjectId;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const orderItemSchema = new Schema<IOrderItem>(
  {
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
  },
  { _id: false },
);

const productOrderSchema = new Schema<IProductOrder>({
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
productOrderSchema.virtual('gstTotal').get(function (this: IProductOrder) {
  return this.taxAmount ?? 0;
});
productOrderSchema.virtual('total').get(function (this: IProductOrder) {
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

export const ProductOrder = model<
  IProductOrder,
  PaginateModel<IProductOrder> & Model<IProductOrder>
>('ProductOrder', productOrderSchema);
