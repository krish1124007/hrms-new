import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

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

const noticeAttachmentSchema = new Schema<INoticeAttachment>(
  {
    name: { type: String, required: true },
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
  },
  { _id: false },
);

const noticeAcknowledgementSchema = new Schema<INoticeAcknowledgement>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    acknowledgedAt: { type: Date, required: true },
  },
  { _id: false },
);

const noticeSchema = new Schema<INotice>({
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

export const Notice = model<INotice, PaginateModel<INotice> & Model<INotice>>(
  'Notice',
  noticeSchema,
);
