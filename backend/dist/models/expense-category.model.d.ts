import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IExpenseCategory extends Document {
    name: string;
    code: string;
    description?: string;
    limit?: number;
    requiresReceipt: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const ExpenseCategory: PaginateModel<IExpenseCategory> & Model<IExpenseCategory, {}, {}, {}, Document<unknown, {}, IExpenseCategory, {}, {}> & IExpenseCategory & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=expense-category.model.d.ts.map