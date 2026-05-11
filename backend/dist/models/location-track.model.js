import { Schema, model } from 'mongoose';
const locationTrackSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    location: {
        type: { type: String, enum: ['Point'], required: true },
        coordinates: { type: [Number], required: true },
    },
    accuracy: Number,
    speed: Number,
    altitude: Number,
    heading: Number,
    activity: {
        type: String,
        enum: ['still', 'walking', 'running', 'in_vehicle'],
    },
    battery: Number,
    isCharging: Boolean,
    networkType: String,
    isOffline: { type: Boolean, default: false },
    syncedAt: Date,
}, { timestamps: false });
// TTL: keep 90 days
locationTrackSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
locationTrackSchema.index({ employeeId: 1, timestamp: -1 });
locationTrackSchema.index({ location: '2dsphere' });
export const LocationTrack = model('LocationTrack', locationTrackSchema);
//# sourceMappingURL=location-track.model.js.map