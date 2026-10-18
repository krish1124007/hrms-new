import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
import type { AttendanceMethod } from './attendance-config.model.js';
export type AttendanceStatus = 'present' | 'absent' | 'half_day' | 'late' | 'on_leave' | 'holiday' | 'weekend';
export type RegularizationStatus = 'pending' | 'approved' | 'rejected';
/** How an attendance row came to exist. Rows written before this field are `punch`. */
export type AttendanceSource = 'punch' | 'leave' | 'auto_absent' | 'auto_checkout' | 'regularization' | 'correction';
export declare const ATTENDANCE_SOURCES: AttendanceSource[];
export type BreakType = 'tea' | 'lunch' | 'personal' | 'other';
export interface ILocationPoint {
    lat?: number;
    lng?: number;
    accuracy?: number;
    address?: string;
}
export interface IDeviceInfo {
    model?: string;
    os?: string;
    appVersion?: string;
}
export interface ICheckinMetadata {
    qrCodeId?: string;
    ipAddress?: string;
    siteId?: string;
    geofenceId?: string;
    deviceId?: string;
    faceConfidence?: number;
    /** Check-out written by the nightly day-close, not by the employee. */
    autoCheckout?: boolean;
    /** Punch times set by an approved regularization request. */
    regularized?: boolean;
}
export interface ICheckinRecord {
    time?: Date;
    method?: AttendanceMethod;
    location?: ILocationPoint;
    photo?: string;
    deviceInfo?: IDeviceInfo;
    metadata?: ICheckinMetadata;
}
export interface IBreakRecord {
    startTime: Date;
    endTime?: Date;
    duration?: number;
    type: BreakType;
}
export interface IRegularization {
    requestedAt: Date;
    reason: string;
    approvedBy?: Types.ObjectId;
    approvedAt?: Date;
    status: RegularizationStatus;
    /** Punch times the employee is asking to be recorded; applied on approval. */
    requestedCheckIn?: Date;
    requestedCheckOut?: Date;
    /**
     * The request made this row (the day had none). Rejected on a day that is
     * not a working day, such a row is removed rather than left as an
     * `absent` day payroll would dock.
     */
    createdByRequest?: boolean;
}
export interface IAttendance extends Document {
    employeeId: Types.ObjectId;
    date: Date;
    checkIn?: ICheckinRecord;
    checkOut?: ICheckinRecord;
    breaks: IBreakRecord[];
    totalWorkingHours: number;
    overtimeHours: number;
    status: AttendanceStatus;
    lateBy: number;
    earlyLeaveBy: number;
    isRegularized: boolean;
    regularization?: IRegularization;
    /** The approved leave request that produced this row, when `source` is `leave`. */
    leaveRequestId?: Types.ObjectId;
    /** Whether the leave behind this row is paid; undefined for non-leave rows. */
    isPaidLeave?: boolean;
    source: AttendanceSource;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Attendance: PaginateModel<IAttendance> & Model<IAttendance, {}, {}, {}, Document<unknown, {}, IAttendance, {}, {}> & IAttendance & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=attendance.model.d.ts.map