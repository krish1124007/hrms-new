import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type VisitPurpose = 'service' | 'collection' | 'followup' | 'delivery' | 'other';
export type VisitOutcome = 'positive' | 'negative' | 'neutral' | 'followup_required';
export type VisitStatus = 'planned' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'missed';

/** Exceptions shown to managers; computed by the visit engine. */
export interface IVisitFlags {
  awayFromSite: boolean;
  noGps: boolean;
  noSelfie: boolean;
  shortVisit: boolean;
  autoClosed: boolean;
  syncedLate: boolean;
  capturedOffline: boolean;
}

export type VisitReportOutcome = 'completed' | 'follow_up' | 'not_available' | 'other';

/** The work report filed at check-out (photos/documents hold upload keys, not URLs). */
export interface IVisitReport {
  notes?: string;
  photos: string[];
  documents: { key: string; name: string }[];
  peopleMet: { name: string; designation?: string; phone?: string }[];
  outcome?: VisitReportOutcome;
  nextAction?: string;
  followUpDate?: Date;
  checklist?: { checklistId: string; answers: { itemId: string; value: unknown }[] };
  submittedAt?: Date;
  updatedAt?: Date;
}

export interface IVisitCheckpoint {
  time?: Date;
  location?: { lat: number; lng: number; accuracy?: number };
  photo?: string;
  address?: string;
  /** Check-out only: the rep's notes when closing the visit (the visit's `notes` are the check-in ones). */
  notes?: string;
  /** Metres from the site's pin at this checkpoint. */
  distanceM?: number;
  /** Device time the action was captured (offline-safe); `time` holds the effective time. */
  capturedAt?: Date;
  /** When the server received it. */
  receivedAt?: Date;
  /** Idempotency key of the action that set this checkpoint. */
  clientRef?: string;
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
  /** Idempotency key of the check-in (or plan) that created the visit. */
  clientRef?: string;
  /** Business-day label (UTC midnight of the IST day) the visit is planned for. */
  plannedDate?: Date;
  scheduleId?: Types.ObjectId;
  plannedBy?: Types.ObjectId;
  durationMinutes?: number;
  flags: IVisitFlags;
  report?: IVisitReport;
  cancelReason?: string;
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
    distanceM: Number,
    capturedAt: Date,
    receivedAt: Date,
    clientRef: String,
  },
  { _id: false },
);

const flagsSchema = new Schema<IVisitFlags>(
  {
    awayFromSite: { type: Boolean, default: false },
    noGps: { type: Boolean, default: false },
    noSelfie: { type: Boolean, default: false },
    shortVisit: { type: Boolean, default: false },
    autoClosed: { type: Boolean, default: false },
    syncedLate: { type: Boolean, default: false },
    capturedOffline: { type: Boolean, default: false },
  },
  { _id: false },
);

const reportSchema = new Schema<IVisitReport>(
  {
    notes: String,
    photos: { type: [String], default: [] },
    documents: { type: [{ key: String, name: String, _id: false }], default: [] },
    peopleMet: { type: [{ name: String, designation: String, phone: String, _id: false }], default: [] },
    outcome: { type: String, enum: ['completed', 'follow_up', 'not_available', 'other'] },
    nextAction: String,
    followUpDate: Date,
    checklist: {
      checklistId: String,
      answers: { type: [{ itemId: String, value: Schema.Types.Mixed, _id: false }], default: undefined },
    },
    submittedAt: Date,
    updatedAt: Date,
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
    enum: ['planned', 'scheduled', 'in_progress', 'completed', 'cancelled', 'missed'],
    default: 'scheduled',
  },
  clientRef: String,
  plannedDate: Date,
  scheduleId: { type: Schema.Types.ObjectId, ref: 'VisitSchedule' },
  plannedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  durationMinutes: { type: Number, min: 0 },
  flags: { type: flagsSchema, default: () => ({}) },
  report: reportSchema,
  cancelReason: String,
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
