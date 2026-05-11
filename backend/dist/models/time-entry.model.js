import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const timeEntrySchema = new Schema({
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
export const TimeEntry = model('TimeEntry', timeEntrySchema);
//# sourceMappingURL=time-entry.model.js.map