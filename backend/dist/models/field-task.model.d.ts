import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FieldTaskStatus = 'new' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
export interface IFieldTaskLocation {
    lat?: number;
    lng?: number;
    address?: string;
}
export interface IFieldTask extends Document {
    title: string;
    description?: string;
    assignedTo: Types.ObjectId;
    siteId?: Types.ObjectId;
    location?: IFieldTaskLocation;
    priority: FieldTaskPriority;
    status: FieldTaskStatus;
    dueDate?: Date;
    completedAt?: Date;
    /** Proof photos (`/uploads/<key>`), signed into links on the way out. */
    completionPhotos: string[];
    completionNotes?: string;
    /** Idempotency key of the completion (offline replays are no-ops). */
    completionClientRef?: string;
    /** When the server received the completion (`completedAt` is the captured time). */
    completionReceivedAt?: Date;
    /** User who created the task. */
    createdBy?: Types.ObjectId;
    verifiedBy?: Types.ObjectId;
    verifiedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const FieldTask: PaginateModel<IFieldTask> & Model<IFieldTask, {}, {}, {}, Document<unknown, {}, IFieldTask, {}, {}> & IFieldTask & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-task.model.d.ts.map