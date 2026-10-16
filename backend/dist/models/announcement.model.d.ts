import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
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
    body: string;
    excerpt?: string;
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
export declare const Announcement: PaginateModel<IAnnouncement> & Model<IAnnouncement, {}, {}, {}, Document<unknown, {}, IAnnouncement, {}, {}> & IAnnouncement & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=announcement.model.d.ts.map