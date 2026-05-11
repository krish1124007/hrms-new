import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const expenseCategorySchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: { type: String },
    limit: { type: Number, min: 0 },
    requiresReceipt: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
});
expenseCategorySchema.plugin(timestampPlugin);
expenseCategorySchema.plugin(softDeletePlugin);
expenseCategorySchema.plugin(paginatePlugin);
expenseCategorySchema.index({ code: 1 }, { unique: true });
export const ExpenseCategory = model('ExpenseCategory', expenseCategorySchema);
//# sourceMappingURL=expense-category.model.js.map