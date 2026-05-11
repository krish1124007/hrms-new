import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const documentFileSchema = new Schema({
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    key: { type: String, required: true },
}, { _id: false });
const documentShareSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
}, { _id: false });
const documentSchema = new Schema({
    name: { type: String, required: true, trim: true },
    category: { type: String, trim: true },
    folder: { type: String, default: '/' },
    file: { type: documentFileSchema, required: true },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sharedWith: { type: [documentShareSchema], default: [] },
    accessLevel: {
        type: String,
        enum: ['private', 'department', 'all'],
        default: 'private',
    },
    version: { type: Number, default: 1 },
    previousVersion: { type: Schema.Types.ObjectId, ref: 'Document' },
    expiryDate: { type: Date },
    tags: [{ type: String }],
    downloadCount: { type: Number, default: 0 },
});
documentSchema.plugin(timestampPlugin);
documentSchema.plugin(softDeletePlugin);
documentSchema.plugin(paginatePlugin);
documentSchema.index({ folder: 1 });
documentSchema.index({ uploadedBy: 1 });
export const DocumentModel = model('Document', documentSchema);
//# sourceMappingURL=document.model.js.map