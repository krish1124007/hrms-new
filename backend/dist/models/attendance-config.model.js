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
        requireNoteOnLateCheckIn: { type: Boolean, default: false },
        freeLateDaysPerMonth: { type: Number, default: 3, min: 0 },
    },
});
attendanceConfigSchema.plugin(timestampPlugin);
export const AttendanceConfig = model('AttendanceConfig', attendanceConfigSchema);
//# sourceMappingURL=attendance-config.model.js.map