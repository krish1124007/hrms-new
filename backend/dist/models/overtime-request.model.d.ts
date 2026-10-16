import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type OvertimeStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export interface IOvertimeRequest extends Document {
    employee: Types.ObjectId;
    date: Date;
    hours: number;
    reason: string;
    status: OvertimeStatus;
    appliedAt: Date;
    approvedBy?: Types.ObjectId | null;
    approvedAt?: Date | null;
    approverNotes?: string;
    rejectedReason?: string;
    /** Link to the payroll record once it's been counted toward a cycle. */
    payrollRecordId?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const OvertimeRequest: PaginateModel<IOvertimeRequest> & Model<IOvertimeRequest, {}, {}, {}, Document<unknown, {}, IOvertimeRequest, {}, {}> & IOvertimeRequest & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=overtime-request.model.d.ts.map