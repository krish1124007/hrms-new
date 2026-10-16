import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type DocumentAccessLevel = 'private' | 'department' | 'all';

export interface IDocumentFile {
  url: string;
  size: number;
  mimeType: string;
  key: string;
}

export interface IDocumentShare {
  userId?: Types.ObjectId;
  departmentId?: Types.ObjectId;
}

export interface IDocument extends Document {
  name: string;
  category?: string;
  folder: string;
  file: IDocumentFile;
  uploadedBy: Types.ObjectId;
  sharedWith: IDocumentShare[];
  accessLevel: DocumentAccessLevel;
  version: number;
  previousVersion?: Types.ObjectId;
  expiryDate?: Date;
  tags: string[];
  downloadCount: number;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const documentFileSchema = new Schema<IDocumentFile>(
  {
    url: { type: String, required: true },
    size: { type: Number, required: true },
    mimeType: { type: String, required: true },
    key: { type: String, required: true },
  },
  { _id: false },
);

const documentShareSchema = new Schema<IDocumentShare>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    departmentId: { type: Schema.Types.ObjectId, ref: 'Department' },
  },
  { _id: false },
);

const documentSchema = new Schema<IDocument>({
  name: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  folder: { type: String, default: '/' },
  file: { type: documentFileSchema, required: true },
  uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  sharedWith: { type: [documentShareSchema], default: [] },
  accessLevel: {
    type: String,
    enum: ['private', 'department', 'all'],
    default: 'private',
  },
  version: { type: Number, default: 1 },
  previousVersion: { type: Schema.Types.ObjectId, ref: 'Document' },
  expiryDate: { type: Date },
  tags: [{ type: String }],
  downloadCount: { type: Number, default: 0 },
});
documentSchema.plugin(timestampPlugin);
documentSchema.plugin(softDeletePlugin);
documentSchema.plugin(paginatePlugin);

documentSchema.index({ folder: 1 });
documentSchema.index({ uploadedBy: 1 });

export const DocumentModel = model<IDocument, PaginateModel<IDocument> & Model<IDocument>>(
  'Document',
  documentSchema,
);
