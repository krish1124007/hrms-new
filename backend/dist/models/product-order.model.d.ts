import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type OrderStatus = 'draft' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
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
export declare const ProductOrder: PaginateModel<IProductOrder> & Model<IProductOrder, {}, {}, {}, Document<unknown, {}, IProductOrder, {}, {}> & IProductOrder & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=product-order.model.d.ts.map