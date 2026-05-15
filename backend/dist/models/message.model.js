import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const attachmentSchema = new Schema({
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
}, { _id: false });
const reactionSchema = new Schema({
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false });
const readBySchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
}, { _id: false });
const messageSchema = new Schema({
    channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: {
        type: String,
        enum: ['text', 'image', 'file', 'system', 'reply'],
        default: 'text',
    },
    content: { type: String, required: true },
    attachments: { type: [attachmentSchema], default: [] },
    replyTo: { type: Schema.Types.ObjectId, ref: 'Message' },
    reactions: { type: [reactionSchema], default: [] },
    readBy: { type: [readBySchema], default: [] },
    editedAt: { type: Date },
    isDeleted: { type: Boolean, default: false },
});
messageSchema.plugin(timestampPlugin);
messageSchema.plugin(softDeletePlugin);
messageSchema.plugin(paginatePlugin);
messageSchema.index({ channelId: 1, createdAt: -1 });
export const Message = model('Message', messageSchema);
//# sourceMappingURL=message.model.js.map