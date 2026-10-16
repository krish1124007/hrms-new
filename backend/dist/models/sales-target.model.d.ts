import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type TargetType = 'amount' | 'quantity' | 'visits';
export type TargetStatus = 'on_track' | 'behind' | 'exceeded';
export interface ITargetMilestone {
    value: number;
    reward?: string;
    achieved: boolean;
}
export interface ISalesTarget extends Document {
    employeeId: Types.ObjectId;
    period: {
        month: number;
        year: number;
    };
    type: TargetType;
    productCategory?: string;
    targetValue: number;
    achievedValue: number;
    status: TargetStatus;
    milestones: ITargetMilestone[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const SalesTarget: PaginateModel<ISalesTarget> & Model<ISalesTarget, {}, {}, {}, Document<unknown, {}, ISalesTarget, {}, {}> & ISalesTarget & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=sales-target.model.d.ts.map