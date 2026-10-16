import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type EventRecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
export type EventReminderType = 'email' | 'push' | 'sms';

export interface IEventRecurrence {
  frequency: EventRecurrenceFrequency;
  until?: Date;
  count?: number;
}

export interface IEventReminder {
  type: EventReminderType;
  minutes: number;
}

export interface IEvent extends Document {
  title: string;
  description?: string;
  startDate: Date;
  endDate: Date;
  isAllDay: boolean;
  location?: string;
  attendees: Types.ObjectId[];
  recurrence?: IEventRecurrence;
  color?: string;
  reminders: IEventReminder[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const eventRecurrenceSchema = new Schema<IEventRecurrence>(
  {
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: true,
    },
    until: { type: Date },
    count: { type: Number },
  },
  { _id: false },
);

const eventReminderSchema = new Schema<IEventReminder>(
  {
    type: {
      type: String,
      enum: ['email', 'push', 'sms'],
      required: true,
    },
    minutes: { type: Number, required: true },
  },
  { _id: false },
);

const eventSchema = new Schema<IEvent>({
  title: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  isAllDay: { type: Boolean, default: false },
  location: { type: String, trim: true },
  attendees: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  recurrence: { type: eventRecurrenceSchema },
  color: { type: String, default: '#6366f1' },
  reminders: { type: [eventReminderSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});
eventSchema.plugin(timestampPlugin);
eventSchema.plugin(softDeletePlugin);
eventSchema.plugin(paginatePlugin);

eventSchema.index({ startDate: 1 });
eventSchema.index({ createdBy: 1 });

export const Event = model<IEvent, PaginateModel<IEvent> & Model<IEvent>>(
  'Event',
  eventSchema,
);
