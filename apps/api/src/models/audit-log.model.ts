import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'login'
  | 'logout'
  | 'export'
  | 'import';

export interface IAuditLog extends Document {
  userId?: Types.ObjectId;
  action: AuditAction;
  entity: string;
  entityId?: string;
  changes?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    before?: Record<string, any>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    after?: Record<string, any>;
  };
  ip?: string;
  userAgent?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>({
  userId: { type: Schema.Types.ObjectId, ref: 'User' },
  action: {
    type: String,
    enum: ['create', 'update', 'delete', 'login', 'logout', 'export', 'import'],
    required: true,
  },
  entity: { type: String, required: true },
  entityId: String,
  changes: {
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
  },
  ip: String,
  userAgent: String,
  metadata: Schema.Types.Mixed,
});
auditLogSchema.plugin(timestampPlugin);
auditLogSchema.plugin(paginatePlugin);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1 });

export const AuditLog = model<IAuditLog, PaginateModel<IAuditLog> & Model<IAuditLog>>(
  'AuditLog',
  auditLogSchema,
);
