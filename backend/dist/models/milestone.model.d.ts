import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type MilestoneStatus = 'pending' | 'completed';
export interface IMilestone extends Document {
    projectId: Types.ObjectId;
    title: string;
    description?: string;
    dueDate?: Date;
    status: MilestoneStatus;
    completedAt?: Date;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Milestone: PaginateModel<IMilestone> & Model<IMilestone, {}, {}, {}, Document<unknown, {}, IMilestone, {}, {}> & IMilestone & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=milestone.model.d.ts.map