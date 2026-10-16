import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type MilestoneStatus = 'pending' | 'completed';

export interface IMilestone extends Document {
  projectId: Types.ObjectId;
  title: string;
  description?: string;
  dueDate?: Date;
  status: MilestoneStatus;
  completedAt?: Date;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

const milestoneSchema = new Schema<IMilestone>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  title: { type: String, required: true, trim: true },
  description: String,
  dueDate: Date,
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  completedAt: Date,
  order: { type: Number, default: 0 },
});
milestoneSchema.plugin(timestampPlugin);
milestoneSchema.plugin(softDeletePlugin);
milestoneSchema.plugin(paginatePlugin);

milestoneSchema.index({ projectId: 1 });

export const Milestone = model<IMilestone, PaginateModel<IMilestone> & Model<IMilestone>>(
  'Milestone',
  milestoneSchema,
);
