import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface ILeaveBalance extends Document {
    employeeId: Types.ObjectId;
    leaveTypeId: Types.ObjectId;
    year: number;
    allocated: number;
    used: number;
    carried: number;
    adjusted: number;
    balance: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LeaveBalance: PaginateModel<ILeaveBalance> & Model<ILeaveBalance, {}, {}, {}, Document<unknown, {}, ILeaveBalance, {}, {}> & ILeaveBalance & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=leave-balance.model.d.ts.map