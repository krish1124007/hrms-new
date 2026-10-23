import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const ruleSchema = new Schema({
    freq: { type: String, enum: ['weekly', 'monthly'], required: true },
    weekdays: { type: [Number], default: undefined },
    dayOfMonth: { type: Number, min: 1, max: 28 },
    startDate: { type: Date, required: true },
    endDate: Date,
}, { _id: false });
const visitScheduleSchema = new Schema({
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
export const VisitSchedule = model('VisitSchedule', visitScheduleSchema);
//# sourceMappingURL=visit-schedule.model.js.map