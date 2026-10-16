import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ExpenseClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed';
export type ExpensePaymentMethod = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'other';
export interface IExpenseReceipt {
    name: string;
    fileUrl: string;
    uploadedAt: Date;
}
export interface IExpenseClaim extends Document {
    employeeId: Types.ObjectId;
    category: Types.ObjectId;
    amount: number;
    acceptedAmount?: number;
    currency: string;
    date: Date;
    description?: string;
    receiptUrls: IExpenseReceipt[];
    paymentMethod?: ExpensePaymentMethod;
    status: ExpenseClaimStatus;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    rejectedReason?: string;
    reimbursedAt?: Date;
    reimbursementRef?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ExpenseClaim: PaginateModel<IExpenseClaim> & Model<IExpenseClaim, {}, {}, {}, Document<unknown, {}, IExpenseClaim, {}, {}> & IExpenseClaim & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=expense-claim.model.d.ts.map