import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type DisciplinaryType =
  | 'verbal_warning'
  | 'written_warning'
  | 'final_warning'
  | 'pip' // Performance Improvement Plan
  | 'suspension'
  | 'termination'
  | 'other';

export type DisciplinarySeverity = 'low' | 'medium' | 'high' | 'critical';

export type DisciplinaryStatus =
  | 'open' // Issued, awaiting employee acknowledgement
  | 'acknowledged' // Employee has acknowledged
  | 'in_progress' // PIP / corrective action ongoing
  | 'escalated' // Escalated to next level
  | 'resolved' // Closed with positive resolution
  | 'failed' // Closed unsuccessfully (e.g., PIP failed)
  | 'cancelled'; // Withdrawn before completion

export interface IDisciplinaryAttachment {
  name: string;
  url: string;
  uploadedAt: Date;
}

export interface IDisciplinaryComment {
  author: Types.ObjectId;
  text: string;
  createdAt: Date;
}

export interface IDisciplinaryAction extends Document {
  caseNumber: string;
  employee: Types.ObjectId;
  type: DisciplinaryType;
  severity: DisciplinarySeverity;
  status: DisciplinaryStatus;
  title: string;
  description: string;
  incidentDate?: Date;
  issuedAt: Date;
  issuedBy: Types.ObjectId; // User who issued the action
  acknowledgedAt?: Date | null;
  acknowledgementNotes?: string;
  resolutionDate?: Date | null;
  resolutionNotes?: string;
  pipStartDate?: Date | null;
  pipEndDate?: Date | null;
  pipGoals?: string;
  escalatedAt?: Date | null;
  escalatedTo?: Types.ObjectId | null; // User
  escalationReason?: string;
  confidential: boolean;
  attachments: IDisciplinaryAttachment[];
  comments: IDisciplinaryComment[];
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<IDisciplinaryAttachment>(
  {
    name: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const commentSchema = new Schema<IDisciplinaryComment>(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { _id: true },
);

const disciplinarySchema = new Schema<IDisciplinaryAction>({
  caseNumber: { type: String, required: true, trim: true, uppercase: true },
  employee: { type: Schema.Types.ObjectId, ref: 'Employee', required: true, index: true },
  type: {
    type: String,
    enum: [
      'verbal_warning',
      'written_warning',
      'final_warning',
      'pip',
      'suspension',
      'termination',
      'other',
    ],
    default: 'verbal_warning',
    index: true,
  },
  severity: {
    type: String,
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
    index: true,
  },
  status: {
    type: String,
    enum: [
      'open',
      'acknowledged',
      'in_progress',
      'escalated',
      'resolved',
      'failed',
      'cancelled',
    ],
    default: 'open',
    index: true,
  },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  incidentDate: { type: Date },
  issuedAt: { type: Date, required: true, default: () => new Date() },
  issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  acknowledgedAt: { type: Date, default: null },
  acknowledgementNotes: { type: String, trim: true },
  resolutionDate: { type: Date, default: null },
  resolutionNotes: { type: String, trim: true },
  pipStartDate: { type: Date, default: null },
  pipEndDate: { type: Date, default: null },
  pipGoals: { type: String, trim: true },
  escalatedAt: { type: Date, default: null },
  escalatedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  escalationReason: { type: String, trim: true },
  confidential: { type: Boolean, default: true },
  attachments: { type: [attachmentSchema], default: [] },
  comments: { type: [commentSchema], default: [] },
});

disciplinarySchema.plugin(timestampPlugin);
disciplinarySchema.plugin(softDeletePlugin);
disciplinarySchema.plugin(paginatePlugin);

disciplinarySchema.index({ caseNumber: 1 }, { unique: true });
disciplinarySchema.index({ employee: 1, status: 1 });
disciplinarySchema.index({ type: 1, severity: 1 });

export const DisciplinaryAction = model<
  IDisciplinaryAction,
  PaginateModel<IDisciplinaryAction> & Model<IDisciplinaryAction>
>('DisciplinaryAction', disciplinarySchema);
