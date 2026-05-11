import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const salaryComponentSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    type: {
        type: String,
        enum: ['earning', 'deduction', 'employer_contribution'],
        required: true,
    },
    calculationType: {
        type: String,
        enum: ['fixed', 'percentage_of_basic', 'percentage_of_gross'],
        default: 'fixed',
    },
    defaultValue: { type: Number, default: 0 },
    isTaxable: { type: Boolean, default: false },
    isStatutory: { type: Boolean, default: false },
    statutoryType: {
        type: String,
        enum: ['pf_employee', 'pf_employer', 'esic_employee', 'esic_employer', 'professional_tax', 'tds'],
    },
    order: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
});
salaryComponentSchema.plugin(timestampPlugin);
salaryComponentSchema.plugin(softDeletePlugin);
salaryComponentSchema.plugin(paginatePlugin);
salaryComponentSchema.index({ code: 1 }, { unique: true });
export const SalaryComponent = model('SalaryComponent', salaryComponentSchema);
//# sourceMappingURL=salary-component.model.js.map