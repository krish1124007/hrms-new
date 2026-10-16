import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {  } from '../lib/mongoose-plugins.js';

export type TrackingActivityType = 'still' | 'walking' | 'running' | 'in_vehicle';

export interface ILocationGeo {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface ILocationTrack extends Document {
  employeeId: Types.ObjectId;
  timestamp: Date;
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
// TTL: keep 90 days
locationTrackSchema.index({ timestamp: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });
locationTrackSchema.index({ employeeId: 1, timestamp: -1 });
locationTrackSchema.index({ location: '2dsphere' });

export const LocationTrack = model<ILocationTrack, Model<ILocationTrack>>(
  'LocationTrack',
  locationTrackSchema,
);
