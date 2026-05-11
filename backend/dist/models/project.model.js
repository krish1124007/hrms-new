import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const memberSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['manager', 'member', 'viewer'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
}, { _id: true });
const projectSchema = new Schema({
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, trim: true, uppercase: true },
    description: String,
    client: { type: Schema.Types.ObjectId, ref: 'Customer' },
    category: String,
    startDate: Date,
    endDate: Date,
    estimatedHours: Number,
    budget: Number,
    status: {
        type: String,
        enum: ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'],
        default: 'not_started',
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    members: { type: [memberSchema], default: [] },
    progress: { type: Number, default: 0, min: 0, max: 100 },
    color: { type: String, default: '#3b82f6' },
    tags: { type: [String], default: [] },
});
projectSchema.plugin(timestampPlugin);
projectSchema.plugin(softDeletePlugin);
projectSchema.plugin(paginatePlugin);
projectSchema.index({ code: 1 }, { unique: true });
projectSchema.index({ status: 1 });
projectSchema.index({ 'members.userId': 1 });
export const Project = model('Project', projectSchema);
//# sourceMappingURL=project.model.js.map