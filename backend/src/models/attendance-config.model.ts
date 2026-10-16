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
  requireLocation: boolean;
  requireNoteOnLateCheckIn: boolean;
  freeLateDaysPerMonth: number;
}

export interface ILiveTrackingConfig {
  // Master switch — admin turns live location tracking on/off from the panel.
  // When false, mobile clients stop sampling and the ingest endpoint drops
  // any points it receives, so nothing is stored.
  enabled: boolean;
  // How often (seconds) the mobile app samples and uploads a location point
  // while the employee is clocked in. Default 120s (every 2 minutes).
  intervalSeconds: number;
}

/**
 * Which days the company does not work. See `lib/week-off.ts` for how this is
 * applied; admins edit it under Attendance → Settings.
 */
export interface IWeekOffConfig {
  /** Weekdays off every week. 0=Sun .. 6=Sat. */
  fullDaysOff: number[];
  /** Weekdays off only on certain occurrences, e.g. the 2nd and 4th Saturday. */
  partialDaysOff: { day: number; weeks: number[] }[];
}

export interface IAttendanceConfig extends Document {
  enabledMethods: AttendanceMethod[];
  settings: IAttendanceSettings;
  liveTracking: ILiveTrackingConfig;
  weekOff: IWeekOffConfig;
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
    requireLocation: { type: Boolean, default: false },
    requireNoteOnLateCheckIn: { type: Boolean, default: false },
    freeLateDaysPerMonth: { type: Number, default: 3, min: 0 },
  },
  liveTracking: {
    enabled: { type: Boolean, default: false },
    intervalSeconds: { type: Number, default: 120, min: 30 },
  },
  weekOff: {
    // Sunday every week, plus the 4th Saturday — the rule the company ran on
    // before this became configurable.
    fullDaysOff: { type: [Number], default: [0] },
    partialDaysOff: {
      type: [
        new Schema<{ day: number; weeks: number[] }>(
          {
            day: { type: Number, required: true, min: 0, max: 6 },
            weeks: { type: [Number], default: [] },
          },
          { _id: false },
        ),
      ],
      default: [{ day: 6, weeks: [4] }],
    },
  },
});
attendanceConfigSchema.plugin(timestampPlugin);

export const AttendanceConfig = model<IAttendanceConfig, Model<IAttendanceConfig>>(
  'AttendanceConfig',
  attendanceConfigSchema,
);
