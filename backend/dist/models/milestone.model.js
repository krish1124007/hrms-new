import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const milestoneSchema = new Schema({
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true },
    description: String,
    dueDate: Date,
    status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
    completedAt: Date,
    order: { type: Number, default: 0 },
});
milestoneSchema.plugin(timestampPlugin);
milestoneSchema.plugin(softDeletePlugin);
milestoneSchema.plugin(paginatePlugin);
milestoneSchema.index({ projectId: 1 });
export const Milestone = model('Milestone', milestoneSchema);
//# sourceMappingURL=milestone.model.js.map