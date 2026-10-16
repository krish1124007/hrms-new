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
export declare const FieldTask: PaginateModel<IFieldTask> & Model<IFieldTask, {}, {}, {}, Document<unknown, {}, IFieldTask, {}, {}> & IFieldTask & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-task.model.d.ts.map