import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
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
export declare const Message: PaginateModel<IMessage> & Model<IMessage, {}, {}, {}, Document<unknown, {}, IMessage, {}, {}> & IMessage & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=message.model.d.ts.map