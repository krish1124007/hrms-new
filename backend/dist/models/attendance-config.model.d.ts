import { type Document, type Model } from 'mongoose';
export type AttendanceMethod = 'face' | 'qr' | 'dynamic_qr' | 'ip' | 'site' | 'geofence' | 'device' | 'manual';
export interface IAttendanceSettings {
    autoCheckoutTime?: string;
    overtimeThresholdMinutes: number;
    lateMarkAfterMinutes: number;
    halfDayThresholdHours: number;
    requirePhotoOnCheckIn: boolean;
    requireLocation: boolean;
    requireNoteOnLateCheckIn: boolean;
    freeLateDaysPerMonth: number;
    /**
     * Whether an employee must file their day's expenses before checking out:
     * `all` = everyone, `field` = field staff only, `none` = never.
     */
    expenseBeforeCheckout?: 'all' | 'field' | 'none';
}
export interface ILiveTrackingConfig {
    enabled: boolean;
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
    partialDaysOff: {
        day: number;
        weeks: number[];
    }[];
}
export interface IAttendanceConfig extends Document {
    enabledMethods: AttendanceMethod[];
    settings: IAttendanceSettings;
    liveTracking: ILiveTrackingConfig;
    weekOff: IWeekOffConfig;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AttendanceConfig: Model<IAttendanceConfig, {}, {}, {}, Document<unknown, {}, IAttendanceConfig, {}, {}> & IAttendanceConfig & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=attendance-config.model.d.ts.map