import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectMemberRole = 'manager' | 'member' | 'viewer';

export interface IProjectMember {
  _id?: Types.ObjectId;
  userId: Types.ObjectId;
  role: ProjectMemberRole;
  joinedAt: Date;
}

export interface IProject extends Document {
  name: string;
  code: string;
  description?: string;
  client?: Types.ObjectId;
  category?: string;
  startDate?: Date;
  endDate?: Date;
  estimatedHours?: number;
  budget?: number;
  status: ProjectStatus;
  priority: Priority;
  members: IProjectMember[];
  progress: number;
  color: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

const memberSchema = new Schema<IProjectMember>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['manager', 'member', 'viewer'], default: 'member' },
    joinedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const projectSchema = new Schema<IProject>({
  name: { type: String, required: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true },
  description: String,
  client: { type: Schema.Types.ObjectId, ref: 'Customer' },
  category: String,
  startDate: Date,
  endDate: Date,
  estimatedHours: Number,
  budget: Number,
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'on_hold', 'completed', 'cancelled'],
    default: 'not_started',
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  members: { type: [memberSchema], default: [] },
  progress: { type: Number, default: 0, min: 0, max: 100 },
  color: { type: String, default: '#3b82f6' },
  tags: { type: [String], default: [] },
});
projectSchema.plugin(timestampPlugin);
projectSchema.plugin(softDeletePlugin);
projectSchema.plugin(paginatePlugin);

projectSchema.index({ code: 1 }, { unique: true });
projectSchema.index({ status: 1 });
projectSchema.index({ 'members.userId': 1 });

export const Project = model<IProject, PaginateModel<IProject> & Model<IProject>>(
  'Project',
  projectSchema,
);
