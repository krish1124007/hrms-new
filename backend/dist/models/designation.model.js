import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const designationSchema = new Schema({
    name: { type: String, required: true, trim: true },
    department: { type: Schema.Types.ObjectId, ref: 'Department' },
    level: { type: Number, default: 1 },
    description: { type: String },
});
designationSchema.plugin(timestampPlugin);
designationSchema.plugin(softDeletePlugin);
designationSchema.plugin(paginatePlugin);
designationSchema.index({ name: 1, department: 1 }, { unique: true });
export const Designation = model('Designation', designationSchema);
//# sourceMappingURL=designation.model.js.map