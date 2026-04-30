import { Schema, model, type Document, type Model } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';

export type AttendanceMethod =
  | 'face'
  | 'qr'
  | 'dynamic_qr'
  | 'ip'
  | 'site'
  | 'geofence'
  | 'device'
  | 'manual';

export interface IAttendanceSettings {
  autoCheckoutTime?: string; // "HH:mm"
  overtimeThresholdMinutes: number;
  lateMarkAfterMinutes: number;
  halfDayThresholdHours: number;
  requirePhotoOnCheckIn: boolean;
  requireNoteOnLateCheckIn: boolean;
  freeLateDaysPerMonth: number;
}

export interface IAttendanceConfig extends Document {
  enabledMethods: AttendanceMethod[];
  settings: IAttendanceSettings;
  createdAt: Date;
  updatedAt: Date;
}

const attendanceConfigSchema = new Schema<IAttendanceConfig>({
  enabledMethods: {
    type: [String],
    enum: ['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual'],
    default: ['manual'],
  },
  settings: {
    autoCheckoutTime: { type: String },
    overtimeThresholdMinutes: { type: Number, default: 540 },
    lateMarkAfterMinutes: { type: Number, default: 15 },
    halfDayThresholdHours: { type: Number, default: 4 },
    requirePhotoOnCheckIn: { type: Boolean, default: false },
    requireNoteOnLateCheckIn: { type: Boolean, default: false },
    freeLateDaysPerMonth: { type: Number, default: 3, min: 0 },
  },
});
attendanceConfigSchema.plugin(timestampPlugin);

export const AttendanceConfig = model<IAttendanceConfig, Model<IAttendanceConfig>>(
  'AttendanceConfig',
  attendanceConfigSchema,
);
