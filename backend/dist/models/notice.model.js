import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const noticeAttachmentSchema = new Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
}, { _id: false });
const noticeAcknowledgementSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedAt: { type: Date, required: true },
}, { _id: false });
const noticeSchema = new Schema({
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    priority: {
        type: String,
        enum: ['normal', 'important', 'urgent'],
        default: 'normal',
    },
    departments: [{ type: Schema.Types.ObjectId, ref: 'Department' }],
    postedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    expiresAt: { type: Date },
    attachments: { type: [noticeAttachmentSchema], default: [] },
    acknowledgements: { type: [noticeAcknowledgementSchema], default: [] },
    isPinned: { type: Boolean, default: false },
});
noticeSchema.plugin(timestampPlugin);
noticeSchema.plugin(softDeletePlugin);
noticeSchema.plugin(paginatePlugin);
noticeSchema.index({ priority: 1 });
noticeSchema.index({ expiresAt: 1 });
export const Notice = model('Notice', noticeSchema);
//# sourceMappingURL=notice.model.js.map