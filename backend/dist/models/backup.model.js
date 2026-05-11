import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const backupSchema = new Schema({
    type: {
        type: String,
        enum: ['database', 'files', 'full'],
        required: true,
    },
    status: {
        type: String,
        enum: ['in_progress', 'completed', 'failed'],
        default: 'in_progress',
    },
    trigger: {
        type: String,
        enum: ['manual', 'scheduled'],
        default: 'manual',
    },
    size: { type: Number },
    fileUrl: { type: String },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date },
    error: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});
backupSchema.plugin(timestampPlugin);
backupSchema.plugin(softDeletePlugin);
backupSchema.plugin(paginatePlugin);
export const Backup = model('Backup', backupSchema);
//# sourceMappingURL=backup.model.js.map