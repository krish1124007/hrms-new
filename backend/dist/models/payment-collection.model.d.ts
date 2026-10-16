import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type FieldPaymentMethod = 'cash' | 'cheque' | 'upi' | 'bank_transfer' | 'other';
export type PaymentCollectionStatus = 'collected' | 'deposited' | 'verified' | 'bounced';
export interface IPaymentCollection extends Document {
    employeeId: Types.ObjectId;
    clientId: Types.ObjectId;
    amount: number;
    method: FieldPaymentMethod;
    reference?: string;
    collectedAt: Date;
    visitId?: Types.ObjectId;
    orderId?: Types.ObjectId;
    receiptNumber: string;
    notes?: string;
    status: PaymentCollectionStatus;
    depositedAt?: Date;
    verifiedBy?: Types.ObjectId;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PaymentCollection: PaginateModel<IPaymentCollection> & Model<IPaymentCollection, {}, {}, {}, Document<unknown, {}, IPaymentCollection, {}, {}> & IPaymentCollection & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=payment-collection.model.d.ts.map