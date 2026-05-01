import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface ITimeEntry extends Document {
  projectId: Types.ObjectId;
  taskId?: Types.ObjectId;
  userId: Types.ObjectId;
  date: Date;
  hours: number;
  description?: string;
  isBillable: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const timeEntrySchema = new Schema<ITimeEntry>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  hours: { type: Number, required: true, min: 0 },
  description: String,
  isBillable: { type: Boolean, default: true },
});
timeEntrySchema.plugin(timestampPlugin);
timeEntrySchema.plugin(softDeletePlugin);
timeEntrySchema.plugin(paginatePlugin);

timeEntrySchema.index({ projectId: 1, date: -1 });
timeEntrySchema.index({ userId: 1, date: -1 });

export const TimeEntry = model<ITimeEntry, PaginateModel<ITimeEntry> & Model<ITimeEntry>>(
  'TimeEntry',
  timeEntrySchema,
);
