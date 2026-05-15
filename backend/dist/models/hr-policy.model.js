import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const versionSchema = new Schema({
    versionNumber: { type: Number, required: true },
    content: { type: String },
    changeNotes: { type: String, trim: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    effectiveDate: { type: Date, default: null },
}, { _id: true });
const acknowledgementSchema = new Schema({
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    versionNumber: { type: Number, required: true },
    acknowledgedAt: { type: Date, default: () => new Date() },
    comment: { type: String, trim: true },
}, { _id: true });
const attachmentSchema = new Schema({
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    // Storage key on disk — used for cleanup when the attachment is deleted.
    key: { type: String, trim: true },
    uploadedAt: { type: Date, default: () => new Date() },
}, { _id: true });
const policySchema = new Schema({
    policyCode: { type: String, required: true, trim: true, uppercase: true },
    title: { type: String, required: true, trim: true },
    category: {
        type: String,
        enum: [
            'general',
            'code_of_conduct',
            'leave',
            'attendance',
            'compensation',
            'benefits',
            'safety',
            'security',
            'data_privacy',
            'remote_work',
            'travel',
            'expenses',
            'harassment',
            'grievance',
            'it',
            'other',
        ],
        default: 'general',
        index: true,
    },
    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
        index: true,
    },
    summary: { type: String, trim: true },
    content: { type: String, default: '' },
    currentVersion: { type: Number, default: 1 },
    versions: { type: [versionSchema], default: [] },
    effectiveDate: { type: Date, default: null },
    reviewDueDate: { type: Date, default: null },
    mandatory: { type: Boolean, default: false },
    acknowledgements: { type: [acknowledgementSchema], default: [] },
    tags: { type: [String], default: [] },
    attachments: { type: [attachmentSchema], default: [] },
    ownerUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});
policySchema.plugin(timestampPlugin);
policySchema.plugin(softDeletePlugin);
policySchema.plugin(paginatePlugin);
policySchema.index({ policyCode: 1 }, { unique: true });
policySchema.index({ title: 'text', summary: 'text', content: 'text', tags: 'text' });
policySchema.index({ category: 1, status: 1 });
export const HrPolicy = model('HrPolicy', policySchema);
//# sourceMappingURL=hr-policy.model.js.map