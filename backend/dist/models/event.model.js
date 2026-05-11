import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const eventRecurrenceSchema = new Schema({
    frequency: {
        type: String,
        enum: ['daily', 'weekly', 'monthly', 'yearly'],
        required: true,
    },
    until: { type: Date },
    count: { type: Number },
}, { _id: false });
const eventReminderSchema = new Schema({
    type: {
        type: String,
        enum: ['email', 'push', 'sms'],
        required: true,
    },
    minutes: { type: Number, required: true },
}, { _id: false });
const eventSchema = new Schema({
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
export const Event = model('Event', eventSchema);
//# sourceMappingURL=event.model.js.map