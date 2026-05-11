import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const attachmentSchema = new Schema({
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
}, { _id: true });
const taskSchema = new Schema({
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone' },
    title: { type: String, required: true, trim: true },
    description: String,
    assignee: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
        type: String,
        enum: ['todo', 'in_progress', 'in_review', 'done'],
        default: 'todo',
    },
    priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
    dueDate: Date,
    estimatedHours: Number,
    labels: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    order: { type: Number, default: 0 },
    parentTask: { type: Schema.Types.ObjectId, ref: 'Task' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
taskSchema.plugin(timestampPlugin);
taskSchema.plugin(softDeletePlugin);
taskSchema.plugin(paginatePlugin);
taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignee: 1 });
taskSchema.index({ projectId: 1, order: 1 });
export const Task = model('Task', taskSchema);
//# sourceMappingURL=task.model.js.map