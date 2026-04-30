import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';
import type { Priority } from './project.model.js';

export type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';

export interface ITaskAttachment {
  _id?: Types.ObjectId;
  name: string;
  fileUrl: string;
  uploadedAt: Date;
}

export interface ITask extends Document {
  projectId: Types.ObjectId;
  milestoneId?: Types.ObjectId;
  title: string;
  description?: string;
  assignee?: Types.ObjectId;
  status: TaskStatus;
  priority: Priority;
  dueDate?: Date;
  estimatedHours?: number;
  labels: string[];
  attachments: ITaskAttachment[];
  order: number;
  parentTask?: Types.ObjectId;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const attachmentSchema = new Schema<ITaskAttachment>(
  {
    name: { type: String, required: true },
    fileUrl: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: true },
);

const taskSchema = new Schema<ITask>({
  projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
  milestoneId: { type: Schema.Types.ObjectId, ref: 'Milestone' },
  title: { type: String, required: true, trim: true },
  description: String,
  assignee: { type: Schema.Types.ObjectId, ref: 'User' },
  status: {
    type: String,
    enum: ['todo', 'in_progress', 'in_review', 'done'],
    default: 'todo',
  },
  priority: { type: String, enum: ['low', 'medium', 'high', 'critical'], default: 'medium' },
  dueDate: Date,
  estimatedHours: Number,
  labels: { type: [String], default: [] },
  attachments: { type: [attachmentSchema], default: [] },
  order: { type: Number, default: 0 },
  parentTask: { type: Schema.Types.ObjectId, ref: 'Task' },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
});
taskSchema.plugin(timestampPlugin);
taskSchema.plugin(softDeletePlugin);
taskSchema.plugin(paginatePlugin);

taskSchema.index({ projectId: 1, status: 1 });
taskSchema.index({ assignee: 1 });
taskSchema.index({ projectId: 1, order: 1 });

export const Task = model<ITask, PaginateModel<ITask> & Model<ITask>>('Task', taskSchema);
