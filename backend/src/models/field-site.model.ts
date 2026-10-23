import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

/**
 * A place field employees visit (client office, project site, branch, …),
 * pinned on the map with the radius a check-in is expected within.
 *
 * `location` is stored as GeoJSON (`[lng, lat]`, 2dsphere-indexed) and sent
 * out as `{ lat, lng }` (toJSON; `serializeSite` for lean reads). `photo` is
 * the stored `/uploads/<key>` reference, sent out as `photoUrl` (signed on the
 * way out by presignResponse).
 */

export type SiteCreatedVia = 'mobile_pin' | 'web';

export interface ISiteAddress {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface IGeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export interface IFieldSite extends Document {
  /** Idempotency key of the create (mobile pins); unique when present. */
  clientRef?: string;
  name: string;
  /** One of the field settings' `siteTypes` when it was saved. */
  type: string;
  address?: ISiteAddress;
  location?: IGeoPoint;
  /** Metres: a check-in farther than this from the pin is flagged. */
  radiusM: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  photo?: string;
  /** Employees the site is assigned to (the creator, for a pin). */
  assignedTo: Types.ObjectId[];
  /** The User who created it (absent on sites migrated from the old clients). */
  createdBy?: Types.ObjectId;
  createdVia: SiteCreatedVia;
  /** Device time of a pin made offline. */
  capturedAt?: Date;
  lastVisitAt?: Date;
  visitCount: number;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const addressSchema = new Schema<ISiteAddress>(
  {
    line1: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
  },
  { _id: false },
);

const pointSchema = new Schema<IGeoPoint>(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true },
  },
  { _id: false },
);

const fieldSiteSchema = new Schema<IFieldSite>(
  {
    clientRef: { type: String, trim: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    address: { type: addressSchema, default: () => ({}) },
    location: { type: pointSchema, required: false },
    radiusM: { type: Number, required: true, min: 1, default: 200 },
    contactName: { type: String, trim: true },
    contactPhone: { type: String, trim: true },
    notes: { type: String },
    photo: { type: String },
    assignedTo: { type: [{ type: Schema.Types.ObjectId, ref: 'Employee' }], default: [] },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    createdVia: { type: String, enum: ['mobile_pin', 'web'], default: 'web' },
    capturedAt: Date,
    lastVisitAt: Date,
    visitCount: { type: Number, default: 0, min: 0 },
  },
  {
    collection: 'fieldsites',
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        const coords = (ret.location as { coordinates?: number[] } | undefined)?.coordinates;
        ret.location = coords && coords.length === 2 ? { lat: coords[1], lng: coords[0] } : null;
        if (ret.photo !== undefined) ret.photoUrl = ret.photo;
        delete ret.photo;
        return ret;
      },
    },
  },
);
fieldSiteSchema.plugin(timestampPlugin);
fieldSiteSchema.plugin(softDeletePlugin);
fieldSiteSchema.plugin(paginatePlugin);

// The same names and options migration 20261023000001 builds in production.
fieldSiteSchema.index({ location: '2dsphere' }, { name: 'location_2dsphere' });
fieldSiteSchema.index({ assignedTo: 1 }, { name: 'assignedTo_1' });
fieldSiteSchema.index({ name: 1 }, { name: 'name_1' });
fieldSiteSchema.index({ clientRef: 1 }, { name: 'clientRef_1', unique: true, sparse: true });

export const FieldSite = model<IFieldSite, PaginateModel<IFieldSite> & Model<IFieldSite>>(
  'FieldSite',
  fieldSiteSchema,
);
