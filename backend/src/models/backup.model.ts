import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type BackupType = 'database' | 'files' | 'full';
export type BackupStatus = 'in_progress' | 'completed' | 'failed';
export type BackupTrigger = 'manual' | 'scheduled';

export interface IBackup extends Document {
  type: BackupType;
  status: BackupStatus;
  trigger: BackupTrigger;
  size?: number;
  fileUrl?: string;
  startedAt: Date;
  completedAt?: Date;
  error?: string;
  /** Null for scheduled backups (no human user triggered them). */
  createdBy?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

const backupSchema = new Schema<IBackup>({
  type: {
    type: String,
    enum: ['database', 'files', 'full'],
    required: true,
  },
  status: {
    type: String,
    enum: ['in_progress', 'completed', 'failed'],
    default: 'in_progress',
  },
  trigger: {
    type: String,
    enum: ['manual', 'scheduled'],
    default: 'manual',
  },
  size: { type: Number },
  fileUrl: { type: String },
  startedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
  error: { type: String },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
});
backupSchema.plugin(timestampPlugin);
backupSchema.plugin(softDeletePlugin);
backupSchema.plugin(paginatePlugin);

export const Backup = model<IBackup, PaginateModel<IBackup> & Model<IBackup>>(
  'Backup',
  backupSchema,
);
