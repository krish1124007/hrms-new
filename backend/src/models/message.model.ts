import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type MessageType = 'text' | 'image' | 'file' | 'system' | 'reply';

export interface IMessageAttachment {
  name: string;
  url: string;
  size: number;
  mimeType: string;
}

export interface IMessageReaction {
  emoji: string;
  userId: Types.ObjectId;
}

export interface IMessageReadBy {
  userId: Types.ObjectId;
  readAt: Date;
}

export interface IMessage extends Document {
  channelId: Types.ObjectId;
  senderId: Types.ObjectId;
  type: MessageType;
  content: string;
  attachments: IMessageAttachment[];
  replyTo?: Types.ObjectId;
  reactions: IMessageReaction[];
  readBy: IMessageReadBy[];
  editedAt?: Date;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const attachmentSchema = new Schema<IMessageAttachment>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
  },
  { _id: false },
);

const reactionSchema = new Schema<IMessageReaction>(
  {
    emoji: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const readBySchema = new Schema<IMessageReadBy>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const messageSchema = new Schema<IMessage>({
  channelId: { type: Schema.Types.ObjectId, ref: 'Channel', required: true, index: true },
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
messageSchema.index({ channelId: 1 });

export const Message = model<IMessage, PaginateModel<IMessage> & Model<IMessage>>(
  'Message',
  messageSchema,
);
