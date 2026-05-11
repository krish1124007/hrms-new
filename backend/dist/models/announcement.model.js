import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const announcementSchema = new Schema({
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true },
    excerpt: String,
    status: {
        type: String,
        enum: ['draft', 'scheduled', 'published', 'archived'],
        default: 'draft',
        index: true,
    },
    channels: [{ type: String, enum: ['in-app', 'email', 'both'], default: 'in-app' }],
    audience: {
        type: String,
        enum: ['all', 'by_plan', 'by_tenant'],
        default: 'all',
    },
    audiencePlans: [String],
    audienceTenantIds: [Schema.Types.ObjectId],
    scheduledFor: Date,
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    readByTenants: [Schema.Types.ObjectId],
    impressionCount: { type: Number, default: 0 },
    readCount: { type: Number, default: 0 },
});
announcementSchema.plugin(timestampPlugin);
announcementSchema.plugin(paginatePlugin);
announcementSchema.index({ status: 1, publishedAt: -1 });
export const Announcement = model('Announcement', announcementSchema);
//# sourceMappingURL=announcement.model.js.map