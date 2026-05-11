import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const holidaySchema = new Schema({
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
export const Holiday = model('Holiday', holidaySchema);
//# sourceMappingURL=holiday.model.js.map