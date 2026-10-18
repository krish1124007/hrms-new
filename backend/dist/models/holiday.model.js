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
// One *live* holiday per (date, name). Partial on `isDeleted: false` (the
// soft-delete plugin's flag, default false) so a holiday HR deleted by mistake
// can be added again instead of colliding with an invisible row. Legacy rows
// that lack the field simply aren't indexed. autoIndex is off in production,
// so this has to be created by hand there — see the deploy checklist.
holidaySchema.index({ date: 1, name: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
export const Holiday = model('Holiday', holidaySchema);
//# sourceMappingURL=holiday.model.js.map