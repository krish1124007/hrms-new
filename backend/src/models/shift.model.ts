import { Schema, model, type Document, type Model } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export interface IShift extends Document {
  name: string;
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  graceMinutes: number;
  halfDayHours: number;
  fullDayHours: number;
  workDays: number[]; // 0=Sun..6=Sat
  isNightShift: boolean;
  breakDuration: number; // minutes
  isDefault: boolean;
  color: string;
  createdAt: Date;
  updatedAt: Date;
}

const shiftSchema = new Schema<IShift>({
  name: { type: String, required: true, trim: true },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  graceMinutes: { type: Number, default: 15 },
  halfDayHours: { type: Number, default: 4 },
  fullDayHours: { type: Number, default: 8 },
  workDays: { type: [Number], default: [1, 2, 3, 4, 5] },
  isNightShift: { type: Boolean, default: false },
  breakDuration: { type: Number, default: 60 },
  isDefault: { type: Boolean, default: false },
  color: { type: String, default: '#3b82f6' },
});
shiftSchema.plugin(timestampPlugin);
shiftSchema.plugin(softDeletePlugin);
shiftSchema.plugin(paginatePlugin);

shiftSchema.index({ name: 1 }, { unique: true });

export const Shift = model<IShift, PaginateModel<IShift> & Model<IShift>>('Shift', shiftSchema);
