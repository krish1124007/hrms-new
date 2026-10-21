import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/**
 * `pending → confirmed → delivered`, `pending | confirmed → cancelled`
 * (controllers/field-orders.controller.ts). `draft`, `processing` and
 * `shipped` are legacy values older orders may still carry: `draft` behaves as
 * `pending`, `processing`/`shipped` as `confirmed`.
 */
export type OrderStatus = 'pending' | 'confirmed' | 'delivered' | 'cancelled' | 'draft' | 'processing' | 'shipped';
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
export declare const ProductOrder: PaginateModel<IProductOrder> & Model<IProductOrder, {}, {}, {}, Document<unknown, {}, IProductOrder, {}, {}> & IProductOrder & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=product-order.model.d.ts.map