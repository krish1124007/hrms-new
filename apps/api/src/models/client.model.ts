import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type ClientCategory = 'A' | 'B' | 'C';
export type ClientStatus = 'active' | 'inactive';

export interface IClientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface IClientNote {
  text: string;
  by?: Types.ObjectId;
  at: Date;
}

export interface IClient extends Document {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  company?: string;
  category: ClientCategory;
  tags: string[];
  address?: IClientAddress;
  location?: IGeoPoint;
  assignedTo?: Types.ObjectId;
  territory?: string;
  lastVisitDate?: Date;
  totalOrders: number;
  totalPayments: number;
  outstandingAmount: number;
  notes: IClientNote[];
  status: ClientStatus;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<IClientAddress>(
  {
    line1: String,
    line2: String,
    city: String,
    state: String,
    pincode: String,
  },
  { _id: false },
);

const noteSchema = new Schema<IClientNote>(
  {
    text: { type: String, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const clientSchema = new Schema<IClient>({
  name: { type: String, required: true, trim: true },
  contactPerson: String,
  phone: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  company: String,
  category: { type: String, enum: ['A', 'B', 'C'], default: 'C' },
  tags: { type: [String], default: [] },
  address: addressSchema,
  location: {
    type: { type: String, enum: ['Point'] },
    coordinates: { type: [Number] }, // [lng, lat]
  },
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee' },
  territory: String,
  lastVisitDate: Date,
  totalOrders: { type: Number, default: 0 },
  totalPayments: { type: Number, default: 0 },
  outstandingAmount: { type: Number, default: 0 },
  notes: { type: [noteSchema], default: [] },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  customFields: { type: Schema.Types.Mixed, default: {} },
});
clientSchema.plugin(timestampPlugin);
clientSchema.plugin(softDeletePlugin);
clientSchema.plugin(paginatePlugin);

clientSchema.index({ name: 1 });
clientSchema.index({ assignedTo: 1 });
clientSchema.index({ category: 1 });
clientSchema.index({ location: '2dsphere' });

export const Client = model<IClient, PaginateModel<IClient> & Model<IClient>>(
  'Client',
  clientSchema,
);
