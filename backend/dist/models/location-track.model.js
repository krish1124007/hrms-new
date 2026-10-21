import { Schema, model } from 'mongoose';
/** How long a location fix is kept, counted from when the server received it. */
export const LOCATION_TRACK_RETENTION_SECONDS = 60 * 60 * 24 * 90;
const locationTrackSchema = new Schema({
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    timestamp: { type: Date, required: true, default: Date.now },
    receivedAt: { type: Date, required: true, default: Date.now },
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
// TTL on the server's clock, never the device's: a phone with a wrong clock
// must not be able to keep its fixes forever or have them purged at once.
// autoIndex is off in production — migration
// 20261021000001-location-track-received-at builds these there and drops the
// old TTL index on `timestamp`.
locationTrackSchema.index({ receivedAt: 1 }, { expireAfterSeconds: LOCATION_TRACK_RETENTION_SECONDS });
// "Latest fix of the last 2 h" across every rep (the live map).
locationTrackSchema.index({ timestamp: -1 });
locationTrackSchema.index({ employeeId: 1, timestamp: -1 });
locationTrackSchema.index({ location: '2dsphere' });
export const LocationTrack = model('LocationTrack', locationTrackSchema);
//# sourceMappingURL=location-track.model.js.map