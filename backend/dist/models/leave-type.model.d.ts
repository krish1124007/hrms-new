import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type LeaveGender = 'all' | 'male' | 'female';
export interface ILeaveType extends Document {
    name: string;
    code: string;
    daysAllowed: number;
    carryForward: {
        enabled: boolean;
        maxDays: number;
    };
    encashable: boolean;
    paidLeave: boolean;
    applicableGender: LeaveGender;
    probationAllowed: boolean;
    halfDayAllowed: boolean;
    attachmentRequired: boolean;
    color: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LeaveType: PaginateModel<ILeaveType> & Model<ILeaveType, {}, {}, {}, Document<unknown, {}, ILeaveType, {}, {}> & ILeaveType & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=leave-type.model.d.ts.map