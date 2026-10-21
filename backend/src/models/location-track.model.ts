import { Schema, model, type Document, type Model, type Types } from 'mongoose';

export type TrackingActivityType = 'still' | 'walking' | 'running' | 'in_vehicle';

export interface ILocationGeo {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

/** How long a location fix is kept, counted from when the server received it. */
export const LOCATION_TRACK_RETENTION_SECONDS = 60 * 60 * 24 * 90;

export interface ILocationTrack extends Document {
  employeeId: Types.ObjectId;
  /**
   * When the device took the fix (the API's `recordedAt`). Client-supplied:
   * the ingest bounds it (no older than 24 h, never in the future), and
   * retention never keys on it.
   */
  timestamp: Date;
  /** When the server stored the fix (server clock); retention (TTL) keys on this. */
  receivedAt: Date;
  location: ILocationGeo;
  accuracy?: number;
  speed?: number;
  altitude?: number;
  heading?: number;
  activity?: TrackingActivityType;
  battery?: number;
  isCharging?: boolean;
  networkType?: string;
  isOffline?: boolean;
  syncedAt?: Date;
}

const locationTrackSchema = new Schema<ILocationTrack>(
  {
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
  },
  { timestamps: false },
);
// TTL on the server's clock, never the device's: a phone with a wrong clock
// must not be able to keep its fixes forever or have them purged at once.
// autoIndex is off in production — migration
// 20261021000001-location-track-received-at builds these there and drops the
// old TTL index on `timestamp`.
locationTrackSchema.index(
  { receivedAt: 1 },
  { expireAfterSeconds: LOCATION_TRACK_RETENTION_SECONDS },
);
// "Latest fix of the last 2 h" across every rep (the live map).
locationTrackSchema.index({ timestamp: -1 });
locationTrackSchema.index({ employeeId: 1, timestamp: -1 });
locationTrackSchema.index({ location: '2dsphere' });

export const LocationTrack = model<ILocationTrack, Model<ILocationTrack>>(
  'LocationTrack',
  locationTrackSchema,
);
