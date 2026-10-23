import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type VisitPurpose = 'service' | 'collection' | 'followup' | 'delivery' | 'other';
export type VisitOutcome = 'positive' | 'negative' | 'neutral' | 'followup_required';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface IVisitCheckpoint {
  time?: Date;
  location?: { lat: number; lng: number; accuracy?: number };
  photo?: string;
  address?: string;
  /** Check-out only: the rep's notes when closing the visit (the visit's `notes` are the check-in ones). */
  notes?: string;
}

export interface IVisit extends Document {
  employeeId: Types.ObjectId;
  siteId: Types.ObjectId;
  purpose: VisitPurpose;
  checkIn?: IVisitCheckpoint;
  checkOut?: IVisitCheckpoint;
  /** Metres between the check-in fix and the site's pin; unset when either is unknown. */
  distanceFromClientM?: number;
  /** Check-in farther than FIELD_VISIT_RADIUS_M from the site — flagged, never refused. */
  locationMismatch?: boolean;
  /** Checked in without a location fix at a site that has a pin — flagged, never refused. */
  locationMissing?: boolean;
  duration?: number; // minutes
  notes?: string;
  outcome?: VisitOutcome;
  nextFollowUpDate?: Date;
  photos: string[];
  meetingWith?: string;
  isPlanned: boolean;
  status: VisitStatus;
  createdAt: Date;
  updatedAt: Date;
}

const checkpointSchema = new Schema<IVisitCheckpoint>(
  {
    time: Date,
    location: {
      lat: Number,
      lng: Number,
      accuracy: Number,
    },
    photo: String,
    address: String,
    notes: String,
  },
  { _id: false },
);

const visitSchema = new Schema<IVisit>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  siteId: { type: Schema.Types.ObjectId, ref: 'FieldSite', required: true },
  purpose: {
    type: String,
    enum: ['service', 'collection', 'followup', 'delivery', 'other'],
    default: 'other',
  },
  checkIn: checkpointSchema,
  checkOut: checkpointSchema,
  distanceFromClientM: Number,
  locationMismatch: { type: Boolean, default: false },
  locationMissing: { type: Boolean, default: false },
  duration: { type: Number, min: 0 },
  notes: String,
  outcome: {
    type: String,
    enum: ['positive', 'negative', 'neutral', 'followup_required'],
  },
  nextFollowUpDate: Date,
  photos: { type: [String], default: [] },
  meetingWith: String,
  isPlanned: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['scheduled', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled',
  },
});
visitSchema.plugin(timestampPlugin);
visitSchema.plugin(softDeletePlugin);
visitSchema.plugin(paginatePlugin);

visitSchema.index({ employeeId: 1, createdAt: -1 });
visitSchema.index({ siteId: 1, createdAt: -1 });
visitSchema.index({ status: 1 });
visitSchema.index({ 'checkIn.time': -1 });
// One open visit per rep: a concurrent second check-in fails on this index.
// Production builds indexes by hand (autoIndex is off) — see the deploy checklist.
visitSchema.index(
  { employeeId: 1 },
  {
    unique: true,
    name: 'one_open_visit_per_employee',
    partialFilterExpression: { status: 'in_progress', isDeleted: false },
  },
);

export const Visit = model<IVisit, PaginateModel<IVisit> & Model<IVisit>>(
  'Visit',
  visitSchema,
);
