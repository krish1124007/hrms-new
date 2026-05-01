import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type HolidayType = 'public' | 'optional' | 'restricted';

export interface IHoliday extends Document {
  name: string;
  date: Date;
  type: HolidayType;
  departments: Types.ObjectId[];
  isRecurring: boolean;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

const holidaySchema = new Schema<IHoliday>({
  name: { type: String, required: true, trim: true },
  date: { type: Date, required: true },
  type: { type: String, enum: ['public', 'optional', 'restricted'], default: 'public' },
  departments: { type: [Schema.Types.ObjectId], ref: 'Department', default: [] },
  isRecurring: { type: Boolean, default: false },
  description: { type: String },
});
holidaySchema.plugin(timestampPlugin);
holidaySchema.plugin(softDeletePlugin);
holidaySchema.plugin(paginatePlugin);

holidaySchema.index({ date: 1 });

export const Holiday = model<IHoliday, PaginateModel<IHoliday> & Model<IHoliday>>(
  'Holiday',
  holidaySchema,
);
