import { Schema, model } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';
const attendanceConfigSchema = new Schema({
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
                new Schema({
                    day: { type: Number, required: true, min: 0, max: 6 },
                    weeks: { type: [Number], default: [] },
                }, { _id: false }),
            ],
            default: [{ day: 6, weeks: [4] }],
        },
    },
});
attendanceConfigSchema.plugin(timestampPlugin);
export const AttendanceConfig = model('AttendanceConfig', attendanceConfigSchema);
//# sourceMappingURL=attendance-config.model.js.map