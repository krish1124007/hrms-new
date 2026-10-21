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

export interface IOrderItem {
  productId?: Types.ObjectId;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface IProductOrder extends Document {
  orderNumber: string;
  employeeId: Types.ObjectId;
  clientId: Types.ObjectId;
  items: IOrderItem[];
  subtotal: number;
  taxAmount: number;
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
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
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
