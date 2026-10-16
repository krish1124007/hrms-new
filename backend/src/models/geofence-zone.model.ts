import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type GeofenceType = 'circle' | 'polygon';

export interface IGeofenceCenter {
  lat: number;
  lng: number;
}

export interface IGeofenceZone extends Document {
  name: string;
  type: GeofenceType;
  center?: IGeofenceCenter;
  radius?: number; // meters, for circle
  coordinates: IGeofenceCenter[]; // for polygon
  autoCheckIn: boolean;
  autoCheckOut: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const centerSchema = new Schema<IGeofenceCenter>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const geofenceZoneSchema = new Schema<IGeofenceZone>({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ['circle', 'polygon'], required: true },
  center: centerSchema,
  radius: { type: Number },
  coordinates: { type: [centerSchema], default: [] },
  autoCheckIn: { type: Boolean, default: false },
  autoCheckOut: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
});
geofenceZoneSchema.plugin(timestampPlugin);
geofenceZoneSchema.plugin(softDeletePlugin);
geofenceZoneSchema.plugin(paginatePlugin);

geofenceZoneSchema.index({ name: 1 });

export const GeofenceZone = model<
  IGeofenceZone,
  PaginateModel<IGeofenceZone> & Model<IGeofenceZone>
>('GeofenceZone', geofenceZoneSchema);
