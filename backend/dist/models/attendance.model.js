import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const locationSchema = new Schema({
    lat: Number,
    lng: Number,
    accuracy: Number,
    address: String,
}, { _id: false });
const deviceInfoSchema = new Schema({
    model: String,
    os: String,
    appVersion: String,
}, { _id: false });
const metadataSchema = new Schema({
    qrCodeId: String,
    ipAddress: String,
    siteId: String,
    geofenceId: String,
    deviceId: String,
    faceConfidence: Number,
}, { _id: false });
const checkinSchema = new Schema({
    time: Date,
    method: {
        type: String,
        enum: ['face', 'qr', 'dynamic_qr', 'ip', 'site', 'geofence', 'device', 'manual'],
    },
    location: locationSchema,
    photo: String,
    deviceInfo: deviceInfoSchema,
    metadata: metadataSchema,
}, { _id: false });
const breakSchema = new Schema({
    startTime: { type: Date, required: true },
    endTime: { type: Date },
    duration: { type: Number },
    type: { type: String, enum: ['tea', 'lunch', 'personal', 'other'], default: 'other' },
}, { _id: true });
const regularizationSchema = new Schema({
    requestedAt: { type: Date, default: Date.now },
    reason: { type: String, required: true },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: Date,
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
}, { _id: false });
const attendanceSchema = new Schema({
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
export const Attendance = model('Attendance', attendanceSchema);
//# sourceMappingURL=attendance.model.js.map