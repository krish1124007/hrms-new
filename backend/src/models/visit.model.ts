import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type VisitPurpose = 'sales' | 'service' | 'collection' | 'followup' | 'delivery' | 'other';
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
  clientId: Types.ObjectId;
  purpose: VisitPurpose;
  checkIn?: IVisitCheckpoint;
  checkOut?: IVisitCheckpoint;
  /** Metres between the check-in fix and the client's pin; unset when either is unknown. */
  distanceFromClientM?: number;
  /** Check-in farther than FIELD_VISIT_RADIUS_M from the client — flagged, never refused. */
  locationMismatch?: boolean;
  /** Checked in without a location fix at a client that has a pin — flagged, never refused. */
  locationMissing?: boolean;
  duration?: number; // minutes
  notes?: string;
  outcome?: VisitOutcome;
  nextFollowUpDate?: Date;
  photos: string[];
  meetingWith?: string;
  productsDiscussed: string[];
  orderPlaced?: Types.ObjectId;
  paymentCollected?: Types.ObjectId;
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
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', required: true },
  purpose: {
    type: String,
    enum: ['sales', 'service', 'collection', 'followup', 'delivery', 'other'],
    default: 'sales',
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
  productsDiscussed: { type: [String], default: [] },
  orderPlaced: { type: Schema.Types.ObjectId, ref: 'ProductOrder' },
  paymentCollected: { type: Schema.Types.ObjectId, ref: 'PaymentCollection' },
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
visitSchema.index({ clientId: 1, createdAt: -1 });
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
