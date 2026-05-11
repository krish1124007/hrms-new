import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const locationSchema = new Schema({
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
}, { _id: false });
const attendanceSiteSchema = new Schema({
    name: { type: String, required: true, trim: true },
    address: { type: String },
    location: { type: locationSchema, required: true },
    radius: { type: Number, default: 100 },
    assignedEmployees: [{ type: Schema.Types.ObjectId, ref: 'Employee' }],
    isActive: { type: Boolean, default: true },
});
attendanceSiteSchema.plugin(timestampPlugin);
attendanceSiteSchema.plugin(softDeletePlugin);
attendanceSiteSchema.plugin(paginatePlugin);
attendanceSiteSchema.index({ name: 1 });
export const AttendanceSite = model('AttendanceSite', attendanceSiteSchema);
//# sourceMappingURL=attendance-site.model.js.map