import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';
import type { AttendanceMethod } from './attendance-config.model.js';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'half_day'
  | 'late'
  | 'on_leave'
  | 'holiday'
  | 'weekend';

export type RegularizationStatus = 'pending' | 'approved' | 'rejected';

/** How an attendance row came to exist. Rows written before this field are `punch`. */
export type AttendanceSource =
  | 'punch'
  | 'leave'
  | 'auto_absent'
  | 'auto_checkout'
  | 'regularization'
  | 'correction';

export const ATTENDANCE_SOURCES: AttendanceSource[] = [
  'punch',
  'leave',
  'auto_absent',
  'auto_checkout',
  'regularization',
  'correction',
];
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
  /** Check-in made by the first field visit of the day (services/attendance-field-link.service.ts). */
  fieldVisitId?: string;
}

/** `field_visit`: the day's check-in came from a field visit check-in (not a punch method). */
export type CheckinMethod = AttendanceMethod | 'field_visit';

export interface ICheckinRecord {
  time?: Date;
  method?: CheckinMethod;
  location?: ILocationPoint;
  photo?: string;
  deviceInfo?: IDeviceInfo;
  metadata?: ICheckinMetadata;
}

export interface IBreakRecord {
  startTime: Date;
  endTime?: Date;
  duration?: number; // minutes
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
  lateBy: number; // minutes
  earlyLeaveBy: number; // minutes
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

const locationSchema = new Schema<ILocationPoint>(
  {
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String,
  },
  { _id: false },
);

const deviceInfoSchema = new Schema<IDeviceInfo>(
  {
    model: String,
    os: String,
    appVersion: String,
  },
  { _id: false },
);

const metadataSchema = new Schema<ICheckinMetadata>(
  {
    qrCodeId: String,
    ipAddress: String,
    siteId: String,
    geofenceId: String,
    deviceId: String,
    faceConfidence: Number,
    autoCheckout: { type: Boolean },
    regularized: { type: Boolean },
    fieldVisitId: String,
  },
  { _id: false },
);

const checkinSchema = new Schema<ICheckinRecord>(
  {
    time: Date,
    method: {
      type: String,
      enum: ['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual', 'field_visit'],
    },
    location: locationSchema,
    photo: String,
    deviceInfo: deviceInfoSchema,
    metadata: metadataSchema,
  },
  { _id: false },
);

const breakSchema = new Schema<IBreakRecord>(
  {
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number },
    type: { type: String, enum: ['tea', 'lunch', 'personal', 'other'], default: 'other' },
  },
  { _id: true },
);

const regularizationSchema = new Schema<IRegularization>(
  {
    requestedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    requestedCheckIn: Date,
    requestedCheckOut: Date,
    createdByRequest: Boolean,
  },
  { _id: false },
);

const attendanceSchema = new Schema<IAttendance>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  date: { type: Date, required: true, index: true },
  checkIn: checkinSchema,
  checkOut: checkinSchema,
  breaks: { type: [breakSchema], default: [] },
  totalWorkingHours: { type: Number, default: 0 },
  overtimeHours: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['present', 'absent', 'half_day', 'late', 'on_leave', 'holiday', 'weekend'],
    default: 'absent',
  },
  lateBy: { type: Number, default: 0 },
  earlyLeaveBy: { type: Number, default: 0 },
  isRegularized: { type: Boolean, default: false },
  regularization: regularizationSchema,
  leaveRequestId: { type: Schema.Types.ObjectId, ref: 'LeaveRequest' },
  isPaidLeave: { type: Boolean },
  source: { type: String, enum: ATTENDANCE_SOURCES, default: 'punch' },
});
attendanceSchema.plugin(timestampPlugin);
attendanceSchema.plugin(softDeletePlugin);
attendanceSchema.plugin(paginatePlugin);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });
attendanceSchema.index({ leaveRequestId: 1 }, { sparse: true });

export const Attendance = model<IAttendance, PaginateModel<IAttendance> & Model<IAttendance>>(
  'Attendance',
  attendanceSchema,
);
