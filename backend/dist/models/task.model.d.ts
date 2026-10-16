import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
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
export declare const Task: PaginateModel<ITask> & Model<ITask, {}, {}, {}, Document<unknown, {}, ITask, {}, {}> & ITask & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=task.model.d.ts.map