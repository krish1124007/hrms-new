import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';
import { startOfBusinessDay } from '../lib/business-day.js';

/**
 * A visit to a site. Lifecycle: `planned` (POST /visits/plan, a schedule, a
 * follow-up) → `in_progress` (check-in) → `completed` (check-out, or the
 * nightly auto-close); `planned → missed` (nightly, the day passed);
 * `planned | in_progress → cancelled`. A check-in without a planned visit
 * creates the visit `in_progress`. See services/field-visits.service.ts.
 *
 * Times: `checkIn.time` / `checkOut.time` are the effective times (the
 * device's `capturedAt` when it was acceptable, else the server's clock);
 * `receivedAt` is when the server got them. `day` is the visit's IST
 * business day (label at UTC midnight): the check-in's, else the planned one.
 */

export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
export const VISIT_STATUSES: VisitStatus[] = ['planned', 'in_progress', 'completed', 'cancelled', 'missed'];

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
export const VISIT_REPORT_OUTCOMES: VisitReportOutcome[] = ['completed', 'follow_up', 'not_available', 'other'];

/** The work report (photos/documents hold stored `/uploads/<key>` references). */
export interface IVisitReport {
  notes?: string;
  photos: string[];
  documents: { key: string; name: string }[];
  peopleMet: { name: string; designation?: string; phone?: string }[];
  outcome?: VisitReportOutcome;
  nextAction?: string;
  /** IST day label of the follow-up. */
  followUpDate?: Date;
  checklist?: { checklistId: string; answers: { itemId: string; value: unknown }[] };
  /** First submission (server time). */
  submittedAt?: Date;
  updatedAt?: Date;
}

export interface IVisitCheckpoint {
  /** The effective time of the check-in / check-out. */
  time?: Date;
  location?: { lat: number; lng: number; accuracy?: number };
  /** Check-in selfie (`/uploads/<key>`). */
  photo?: string;
  address?: string;
  notes?: string;
  /** Metres from the site's pin at this checkpoint. */
  distanceM?: number;
  /** Device time the action was captured (offline-safe), as sent. */
  capturedAt?: Date;
  /** When the server received it. */
  receivedAt?: Date;
  /** Idempotency key of the action that set this checkpoint. */
  clientRef?: string;
}

export interface IVisit extends Document {
  employeeId: Types.ObjectId;
  siteId: Types.ObjectId;
  /** One of the settings' `visitPurposes` (their spelling). */
  purpose: string;
  status: VisitStatus;
  /** IST business day of the visit (label): the check-in's, else `plannedDate`. */
  day?: Date;
  /** Idempotency key of the check-in that created / started the visit. */
  clientRef?: string;
  /** Business-day label (UTC midnight of the IST day) the visit is planned for. */
  plannedDate?: Date;
  scheduleId?: Types.ObjectId;
  /** User who planned it (planned visits). */
  plannedBy?: Types.ObjectId;
  /** The visit whose report asked for this follow-up. */
  followUpOf?: Types.ObjectId;
  /** Planning notes, or the check-in notes of an unplanned visit. */
  notes?: string;
  checkIn?: IVisitCheckpoint;
  checkOut?: IVisitCheckpoint;
  durationMinutes?: number;
  flags: IVisitFlags;
  report?: IVisitReport;
  /** clientRefs of the report edits already applied (latest 20) — replays are no-ops. */
  reportClientRefs: string[];
  cancelReason?: string;
  cancelledBy?: Types.ObjectId;
  isDeleted?: boolean;
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
    outcome: { type: String, enum: VISIT_REPORT_OUTCOMES },
    nextAction: String,
    followUpDate: Date,
    checklist: {
      type: new Schema(
        {
          checklistId: String,
          answers: { type: [{ itemId: String, value: Schema.Types.Mixed, _id: false }], default: [] },
        },
        { _id: false },
      ),
      default: undefined,
    },
    submittedAt: Date,
    updatedAt: Date,
  },
  { _id: false },
);

const visitSchema = new Schema<IVisit>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  siteId: { type: Schema.Types.ObjectId, ref: 'FieldSite', required: true },
  purpose: { type: String, trim: true, default: 'Other' },
  status: { type: String, enum: VISIT_STATUSES, default: 'planned' },
  day: Date,
  clientRef: String,
  plannedDate: Date,
  scheduleId: { type: Schema.Types.ObjectId, ref: 'VisitSchedule' },
  plannedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  followUpOf: { type: Schema.Types.ObjectId, ref: 'Visit' },
  notes: String,
  checkIn: checkpointSchema,
  checkOut: checkpointSchema,
  durationMinutes: { type: Number, min: 0 },
  flags: { type: flagsSchema, default: () => ({}) },
  report: reportSchema,
  reportClientRefs: { type: [String], default: [] },
  cancelReason: String,
  cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
visitSchema.plugin(timestampPlugin);
visitSchema.plugin(softDeletePlugin);
visitSchema.plugin(paginatePlugin);

/** The IST business day a visit belongs to: its check-in's, else the planned day. */
export function visitDayOf(v: { checkIn?: { time?: Date | null } | null; plannedDate?: Date | null; createdAt?: Date | null }): Date {
  return startOfBusinessDay(v.checkIn?.time ?? v.plannedDate ?? v.createdAt ?? new Date());
}

// `day` follows the check-in / planned date on every save (the engine's
// conditional updates set it themselves).
visitSchema.pre('validate', function (next) {
  if (!this.day || this.isModified('checkIn.time') || this.isModified('plannedDate')) {
    this.day = visitDayOf(this);
  }
  next();
});

visitSchema.index({ employeeId: 1, day: -1 });
visitSchema.index({ employeeId: 1, createdAt: -1 });
visitSchema.index({ siteId: 1, 'checkIn.time': -1 });
visitSchema.index({ status: 1, plannedDate: 1 });
visitSchema.index({ 'checkIn.time': -1 });
// Offline replays: one visit per (employee, check-in clientRef).
visitSchema.index(
  { employeeId: 1, clientRef: 1 },
  { unique: true, name: 'employee_clientRef_unique', partialFilterExpression: { clientRef: { $type: 'string' } } },
);
// One open visit per employee per business day: a concurrent second
// check-in fails here. Per day, so an offline replay of an older day can land
// while today's visit is open. Production builds indexes by hand (autoIndex
// is off) — migration 20261023000002.
visitSchema.index(
  { employeeId: 1, day: 1 },
  {
    unique: true,
    name: 'one_open_visit_per_employee_day',
    partialFilterExpression: { status: 'in_progress', isDeleted: false },
  },
);
// A schedule plans each date once.
visitSchema.index(
  { scheduleId: 1, plannedDate: 1 },
  { unique: true, name: 'schedule_date_unique', partialFilterExpression: { scheduleId: { $type: 'objectId' } } },
);
// One follow-up visit per reported visit.
visitSchema.index(
  { followUpOf: 1 },
  { unique: true, name: 'followUpOf_unique', partialFilterExpression: { followUpOf: { $type: 'objectId' } } },
);

export const Visit = model<IVisit, PaginateModel<IVisit> & Model<IVisit>>(
  'Visit',
  visitSchema,
);
