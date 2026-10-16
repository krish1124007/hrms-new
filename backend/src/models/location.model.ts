import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type LocationType = 'office' | 'branch' | 'warehouse' | 'site';

export interface ILocationCoordinates {
  lat: number;
  lng: number;
}

export interface ILocation extends Document {
  name: string;
  type: LocationType;
  address: string;
  coordinates?: ILocationCoordinates;
  phone?: string;
  manager?: Types.ObjectId;
  employees: Types.ObjectId[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const locationCoordinatesSchema = new Schema<ILocationCoordinates>(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false },
);

const locationSchema = new Schema<ILocation>({
  name: { type: String, required: true, trim: true },
  type: {
    type: String,
    enum: ['office', 'branch', 'warehouse', 'site'],
    required: true,
  },
  address: { type: String, required: true, trim: true },
  coordinates: { type: locationCoordinatesSchema },
  phone: { type: String, trim: true },
  manager: { type: Schema.Types.ObjectId, ref: 'User' },
  employees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  isActive: { type: Boolean, default: true },
});
locationSchema.plugin(timestampPlugin);
locationSchema.plugin(softDeletePlugin);
locationSchema.plugin(paginatePlugin);

locationSchema.index({ type: 1 });

export const Location = model<ILocation, PaginateModel<ILocation> & Model<ILocation>>(
  'Location',
  locationSchema,
);
