import { Schema, model, type Document, type Types } from 'mongoose';

/**
 * A measured day route (services/field-route.service.ts): the legs between
 * one employee's check-in/out points on one IST day. A cache, not a record —
 * reused while `signature` (the day's points) is unchanged, so road
 * distances are asked of Google once per day and again only when a new point
 * arrives. Collection `fielddayroutes`; one document per employee and day.
 */
export interface IFieldDayRouteLeg {
  fromIndex: number;
  toIndex: number;
  distanceM: number;
  estimated: boolean;
}

export interface IFieldDayRoute extends Document {
  employeeId: Types.ObjectId;
  /** IST calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Hash of the day's ordered points the legs were measured for. */
  signature: string;
  legs: IFieldDayRouteLeg[];
  totalKm: number;
  estimated: boolean;
  computedAt: Date;
}

const legSchema = new Schema<IFieldDayRouteLeg>(
  {
    fromIndex: { type: Number, required: true },
    toIndex: { type: Number, required: true },
    distanceM: { type: Number, required: true },
    estimated: { type: Boolean, default: false },
  },
  { _id: false },
);

const fieldDayRouteSchema = new Schema<IFieldDayRoute>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true },
    signature: { type: String, required: true },
    legs: { type: [legSchema], default: [] },
    totalKm: { type: Number, default: 0 },
    estimated: { type: Boolean, default: false },
    computedAt: { type: Date, default: Date.now },
  },
  { collection: 'fielddayroutes' },
);

// Production builds indexes by hand (migration 20261023000005).
fieldDayRouteSchema.index({ employeeId: 1, date: 1 }, { unique: true, name: 'employeeId_1_date_1' });

export const FieldDayRoute = model<IFieldDayRoute>('FieldDayRoute', fieldDayRouteSchema);
