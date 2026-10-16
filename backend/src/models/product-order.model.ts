import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';
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

export const ProductOrder = model<
  IProductOrder,
  PaginateModel<IProductOrder> & Model<IProductOrder>
>('ProductOrder', productOrderSchema);
