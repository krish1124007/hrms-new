import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

/**
 * A recurring visit: `employeeId` visits `siteId` every week on `weekdays`
 * (1 = Mon … 7 = Sun) or every month on `dayOfMonth` (1–28), from
 * `startDate` until `endDate` (inclusive, IST day labels). The nightly field
 * run turns it into planned visits 7 days ahead (one per schedule and date).
 */
export type ScheduleFreq = 'weekly' | 'monthly';

export interface IScheduleRule {
  freq: ScheduleFreq;
  weekdays?: number[];
  dayOfMonth?: number;
  startDate: Date;
  endDate?: Date;
}

export interface IVisitSchedule extends Document {
  employeeId: Types.ObjectId;
  siteId: Types.ObjectId;
  purpose: string;
  notes?: string;
  rule: IScheduleRule;
  createdBy?: Types.ObjectId;
  isDeleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ruleSchema = new Schema<IScheduleRule>(
  {
    freq: { type: String, enum: ['weekly', 'monthly'], required: true },
    weekdays: { type: [Number], default: undefined },
    dayOfMonth: { type: Number, min: 1, max: 28 },
    startDate: { type: Date, required: true },
    endDate: Date,
  },
  { _id: false },
);

const visitScheduleSchema = new Schema<IVisitSchedule>({
  employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  siteId: { type: Schema.Types.ObjectId, ref: 'FieldSite', required: true },
  purpose: { type: String, required: true, trim: true },
  notes: String,
  rule: { type: ruleSchema, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
visitScheduleSchema.plugin(timestampPlugin);
visitScheduleSchema.plugin(softDeletePlugin);
visitScheduleSchema.plugin(paginatePlugin);

visitScheduleSchema.index({ employeeId: 1 });

export const VisitSchedule = model<IVisitSchedule, PaginateModel<IVisitSchedule> & Model<IVisitSchedule>>(
  'VisitSchedule',
  visitScheduleSchema,
);
