import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type ChannelType = 'direct' | 'group' | 'department' | 'project';
export type ChannelMemberRole = 'admin' | 'member';

export interface IChannelMember {
  userId: Types.ObjectId;
  role: ChannelMemberRole;
  joinedAt: Date;
  lastReadAt: Date;
}

export interface IChannelLastMessage {
  content: string;
  senderId: Types.ObjectId;
  timestamp: Date;
}

export interface IChannel extends Document {
  name?: string;
  type: ChannelType;
  members: IChannelMember[];
  isPrivate: boolean;
  avatar?: string;
  description?: string;
  createdBy: Types.ObjectId;
  lastMessage?: IChannelLastMessage;
  pinnedMessages: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const channelMemberSchema = new Schema<IChannelMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
    lastReadAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const lastMessageSchema = new Schema<IChannelLastMessage>(
  {
    content: { type: String, required: true },
    senderId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    timestamp: { type: Date, required: true },
  },
  { _id: false },
);

const channelSchema = new Schema<IChannel>({
  name: { type: String, trim: true },
  type: {
    type: String,
    enum: ['direct', 'group', 'department', 'project'],
    required: true,
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

export const Channel = model<IChannel, PaginateModel<IChannel> & Model<IChannel>>(
  'Channel',
  channelSchema,
);
