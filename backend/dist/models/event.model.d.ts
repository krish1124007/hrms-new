import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
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
export declare const Event: PaginateModel<IEvent> & Model<IEvent, {}, {}, {}, Document<unknown, {}, IEvent, {}, {}> & IEvent & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=event.model.d.ts.map