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
  duration?: number; // minutes
  type: BreakType;
}

export interface IRegularization {
  requestedAt: Date;
  reason: string;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  status: RegularizationStatus;
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
  },
  { _id: false },
);

const checkinSchema = new Schema<ICheckinRecord>(
  {
    time: Date,
    method: {
      type: String,
      enum: ['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual'],
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
});
attendanceSchema.plugin(timestampPlugin);
attendanceSchema.plugin(softDeletePlugin);
attendanceSchema.plugin(paginatePlugin);

attendanceSchema.index({ employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ date: 1, status: 1 });

export const Attendance = model<IAttendance, PaginateModel<IAttendance> & Model<IAttendance>>(
  'Attendance',
  attendanceSchema,
);
