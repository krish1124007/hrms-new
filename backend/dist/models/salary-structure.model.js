import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const structureComponentSchema = new Schema({
    componentId: { type: Schema.Types.ObjectId, ref: 'SalaryComponent', required: true },
    calculationType: {
        type: String,
        enum: ['fixed', 'percentage_of_basic', 'percentage_of_gross'],
        default: 'fixed',
    },
    value: { type: Number, default: 0 },
}, { _id: false });
const salaryStructureSchema = new Schema({
    name: { type: String, required: true, trim: true },
    components: { type: [structureComponentSchema], default: [] },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
});
salaryStructureSchema.plugin(timestampPlugin);
salaryStructureSchema.plugin(softDeletePlugin);
salaryStructureSchema.plugin(paginatePlugin);
salaryStructureSchema.index({ name: 1 }, { unique: true });
export const SalaryStructure = model('SalaryStructure', salaryStructureSchema);
//# sourceMappingURL=salary-structure.model.js.map