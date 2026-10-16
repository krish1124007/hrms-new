import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type NoticePriority = 'normal' | 'important' | 'urgent';
export interface INoticeAttachment {
    name: string;
    url: string;
    size: number;
    mimeType: string;
}
export interface INoticeAcknowledgement {
    userId: Types.ObjectId;
    acknowledgedAt: Date;
}
export interface INotice extends Document {
    title: string;
    content: string;
    priority: NoticePriority;
    departments: Types.ObjectId[];
    postedBy: Types.ObjectId;
    expiresAt?: Date;
    attachments: INoticeAttachment[];
    acknowledgements: INoticeAcknowledgement[];
    isPinned: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export declare const Notice: PaginateModel<INotice> & Model<INotice, {}, {}, {}, Document<unknown, {}, INotice, {}, {}> & INotice & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=notice.model.d.ts.map