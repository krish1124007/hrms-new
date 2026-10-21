import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/** GST slabs a product may carry, in percent. */
export declare const GST_RATES: readonly [0, 5, 12, 18, 28];
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
export declare const Product: PaginateModel<IProduct> & Model<IProduct, {}, {}, {}, Document<unknown, {}, IProduct, {}, {}> & IProduct & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=product.model.d.ts.map