import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  softDeletePlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FieldTaskStatus =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface IFieldTaskLocation {
  lat?: number;
  lng?: number;
  address?: string;
}

export interface IFieldTask extends Document {
  title: string;
  description?: string;
  assignedTo: Types.ObjectId;
  clientId?: Types.ObjectId;
  location?: IFieldTaskLocation;
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  dueDate?: Date;
  completedAt?: Date;
  completionPhotos: string[];
  completionNotes?: string;
  verifiedBy?: Types.ObjectId;
  verifiedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const locationSchema = new Schema<IFieldTaskLocation>(
  {
    lat: Number,
    lng: Number,
    address: String,
  },
  { _id: false },
);

const fieldTaskSchema = new Schema<IFieldTask>({
  title: { type: String, required: true, trim: true },
  description: String,
  assignedTo: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client' },
  location: locationSchema,
  priority: {
    type: String,
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium',
  },
  status: {
    type: String,
    enum: ['new', 'accepted', 'in_progress', 'completed', 'cancelled'],
    default: 'new',
  },
  dueDate: Date,
  completedAt: Date,
  completionPhotos: { type: [String], default: [] },
  completionNotes: String,
  verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: Date,
});
fieldTaskSchema.plugin(timestampPlugin);
fieldTaskSchema.plugin(softDeletePlugin);
fieldTaskSchema.plugin(paginatePlugin);

fieldTaskSchema.index({ assignedTo: 1, status: 1 });
fieldTaskSchema.index({ dueDate: 1 });

export const FieldTask = model<IFieldTask, PaginateModel<IFieldTask> & Model<IFieldTask>>(
  'FieldTask',
  fieldTaskSchema,
);
