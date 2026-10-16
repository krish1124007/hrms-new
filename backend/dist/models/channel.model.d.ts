import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
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
export declare const Channel: PaginateModel<IChannel> & Model<IChannel, {}, {}, {}, Document<unknown, {}, IChannel, {}, {}> & IChannel & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=channel.model.d.ts.map