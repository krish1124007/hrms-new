import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import {
  timestampPlugin,
  paginatePlugin,
  type PaginateModel,
} from '../lib/mongoose-plugins.js';

/**
 * Platform-wide announcements broadcast from super admin to tenants.
 *
 * Not tenant-scoped — uses no . Instead, `audience` determines
 * who sees each announcement.
 */

export type AnnouncementStatus = 'draft' | 'scheduled' | 'published' | 'archived';
export type AnnouncementChannel = 'in-app' | 'email' | 'both';
export type AnnouncementAudience = 'all' | 'by_plan' | 'by_tenant';

export interface IAnnouncement extends Document {
  title: string;
  body: string;           // Rich-text HTML (sanitized)
  excerpt?: string;       // Shown in notification lists
  status: AnnouncementStatus;
  channels: AnnouncementChannel[];
  audience: AnnouncementAudience;
  /** If audience=by_plan, list of plan slugs */
  audiencePlans?: string[];
  /** If audience=by_tenant, list of tenant IDs */
  audienceTenantIds?: Types.ObjectId[];
  scheduledFor?: Date;
  publishedAt?: Date;
  createdBy?: Types.ObjectId;
  /** Tenant IDs that have dismissed / read this */
  readByTenants?: Types.ObjectId[];
  impressionCount: number;
  readCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const announcementSchema = new Schema<IAnnouncement>({
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true },
  excerpt: String,
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'published', 'archived'],
    default: 'draft',
    index: true,
  },
  channels: [{ type: String, enum: ['in-app', 'email', 'both'], default: 'in-app' }],
  audience: {
    type: String,
    enum: ['all', 'by_plan', 'by_tenant'],
    default: 'all',
  },
  audiencePlans: [String],
  audienceTenantIds: [Schema.Types.ObjectId],
  scheduledFor: Date,
  publishedAt: Date,
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  readByTenants: [Schema.Types.ObjectId],
  impressionCount: { type: Number, default: 0 },
  readCount: { type: Number, default: 0 },
});

announcementSchema.plugin(timestampPlugin);
announcementSchema.plugin(paginatePlugin);

announcementSchema.index({ status: 1, publishedAt: -1 });

export const Announcement = model<IAnnouncement, PaginateModel<IAnnouncement> & Model<IAnnouncement>>(
  'Announcement',
  announcementSchema,
);
