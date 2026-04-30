import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type NotificationType =
  | 'leave_request'
  | 'expense_request'
  | 'task_assigned'
  | 'attendance_anomaly'
  | 'payment_due'
  | 'system_alert'
  | 'approval_request';

export interface INotification extends Document {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  metadata?: Record<string, unknown>;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: [
      'leave_request',
      'expense_request',
      'task_assigned',
      'attendance_anomaly',
      'payment_due',
      'system_alert',
      'approval_request',
    ],
    required: true,
  },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: String,
  metadata: Schema.Types.Mixed,
  isRead: { type: Boolean, default: false },
  readAt: Date,
});
notificationSchema.plugin(timestampPlugin);
notificationSchema.plugin(paginatePlugin);

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });

export const Notification = model<INotification, PaginateModel<INotification> & Model<INotification>>(
  'Notification',
  notificationSchema,
);
