import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type HalfDayType = 'first_half' | 'second_half';
export interface ILeaveAttachment {
    name: string;
    fileUrl: string;
    uploadedAt: Date;
}
export interface ILeaveRequest extends Document {
    employeeId: Types.ObjectId;
    leaveTypeId: Types.ObjectId;
    startDate: Date;
    endDate: Date;
    days: number;
    isHalfDay: boolean;
    halfDayType?: HalfDayType;
    reason: string;
    attachments: ILeaveAttachment[];
    status: LeaveStatus;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    rejectedReason?: string;
    /** Why HR cancelled the request (required when it is not the owner withdrawing it). */
    cancelReason?: string;
    appliedAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const LeaveRequest: PaginateModel<ILeaveRequest> & Model<ILeaveRequest, {}, {}, {}, Document<unknown, {}, ILeaveRequest, {}, {}> & ILeaveRequest & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=leave-request.model.d.ts.map