import { Schema, model } from 'mongoose';
import { timestampPlugin, softDeletePlugin, paginatePlugin, } from '../lib/mongoose-plugins.js';
const channelMemberSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: Date.now },
}, { _id: false });
const lastMessageSchema = new Schema({
    content: { type: String, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, required: true },
}, { _id: false });
const channelSchema = new Schema({
    name: { type: String, trim: true },
    type: {
        type: String,
        enum: ['direct', 'group', 'department', 'project'],
        required: true,
        index: true,
    },
    members: { type: [channelMemberSchema], default: [] },
    isPrivate: { type: Boolean, default: false },
    avatar: { type: String },
    description: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lastMessage: { type: lastMessageSchema },
    pinnedMessages: [{ type: Schema.Types.ObjectId, ref: 'Message' }],
});
channelSchema.plugin(timestampPlugin);
channelSchema.plugin(softDeletePlugin);
channelSchema.plugin(paginatePlugin);
channelSchema.index({ 'members.userId': 1 });
channelSchema.index({ type: 1 });
export const Channel = model('Channel', channelSchema);
//# sourceMappingURL=channel.model.js.map