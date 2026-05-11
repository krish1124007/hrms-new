import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const departmentSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String },
    head: { type: Schema.Types.ObjectId, ref: 'Employee' },
    parentDepartment: { type: Schema.Types.ObjectId, ref: 'Department' },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
});
departmentSchema.plugin(timestampPlugin);
departmentSchema.plugin(softDeletePlugin);
departmentSchema.plugin(paginatePlugin);
departmentSchema.index({ code: 1 }, { unique: true });
departmentSchema.index({ parentDepartment: 1 });
export const Department = model('Department', departmentSchema);
//# sourceMappingURL=department.model.js.map