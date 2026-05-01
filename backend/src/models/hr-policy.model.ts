import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type PolicyCategory =
  | 'general'
  | 'code_of_conduct'
  | 'leave'
  | 'attendance'
  | 'compensation'
  | 'benefits'
  | 'safety'
  | 'security'
  | 'data_privacy'
  | 'remote_work'
  | 'travel'
  | 'expenses'
  | 'harassment'
  | 'grievance'
  | 'it'
  | 'other';

export type PolicyStatus = 'draft' | 'published' | 'archived';

export interface IPolicyVersion {
  versionNumber: number;
  content: string;
  changeNotes?: string;
  publishedAt?: Date | null;
  publishedBy?: Types.ObjectId | null;
  effectiveDate?: Date | null;
}

export interface IPolicyAcknowledgement {
  employee: Types.ObjectId;
  versionNumber: number;
  acknowledgedAt: Date;
  comment?: string;
}

export interface IHrPolicy extends Document {
  policyCode: string;
  title: string;
  category: PolicyCategory;
  status: PolicyStatus;
  summary?: string;
  content: string; // current published / draft content
  currentVersion: number;
  versions: IPolicyVersion[];
  effectiveDate?: Date | null;
  reviewDueDate?: Date | null;
  mandatory: boolean;
  acknowledgements: IPolicyAcknowledgement[];
  tags: string[];
  attachments: { name: string; url: string; uploadedAt: Date }[];
  ownerUser?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const versionSchema = new Schema<IPolicyVersion>(
  {
    versionNumber: { type: Number, required: true },
    content: { type: String, required: true },
    changeNotes: { type: String, trim: true },
    publishedAt: { type: Date, default: null },
    publishedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    effectiveDate: { type: Date, default: null },
  },
  { _id: true },
);

const acknowledgementSchema = new Schema<IPolicyAcknowledgement>(
  {
    employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    versionNumber: { type: Number, required: true },
    acknowledgedAt: { type: Date, default: () => new Date() },
    comment: { type: String, trim: true },
  },
  { _id: true },
);

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    // Storage key on disk — used for cleanup when the attachment is deleted.
    key: { type: String, trim: true },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const policySchema = new Schema<IHrPolicy>({
  policyCode: { type: String, required: true, trim: true, uppercase: true },
  title: { type: String, required: true, trim: true },
  category: {
    type: String,
    enum: [
      'general',
      'code_of_conduct',
      'leave',
      'attendance',
      'compensation',
      'benefits',
      'safety',
      'security',
      'data_privacy',
      'remote_work',
      'travel',
      'expenses',
      'harassment',
      'grievance',
      'it',
      'other',
    ],
    default: 'general',
    index: true,
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft',
    index: true,
  },
  summary: { type: String, trim: true },
  content: { type: String, required: true, default: '' },
  currentVersion: { type: Number, default: 1 },
  versions: { type: [versionSchema], default: [] },
  effectiveDate: { type: Date, default: null },
  reviewDueDate: { type: Date, default: null },
  mandatory: { type: Boolean, default: false },
  acknowledgements: { type: [acknowledgementSchema], default: [] },
  tags: { type: [String], default: [] },
  attachments: { type: [attachmentSchema], default: [] },
  ownerUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});

policySchema.plugin(timestampPlugin);
policySchema.plugin(softDeletePlugin);
policySchema.plugin(paginatePlugin);

policySchema.index({ policyCode: 1 }, { unique: true });
policySchema.index({ title: 'text', summary: 'text', content: 'text', tags: 'text' });
policySchema.index({ category: 1, status: 1 });

export const HrPolicy = model<IHrPolicy, PaginateModel<IHrPolicy> & Model<IHrPolicy>>(
  'HrPolicy',
  policySchema,
);
