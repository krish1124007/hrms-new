import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type ProjectStatus = 'not_started' | 'in_progress' | 'on_hold' | 'completed' | 'cancelled';
export type Priority = 'low' | 'medium' | 'high' | 'critical';
export type ProjectMemberRole = 'manager' | 'member' | 'viewer';
export interface IProjectMember {
    _id?: Types.ObjectId;
    userId: Types.ObjectId;
    role: ProjectMemberRole;
    joinedAt: Date;
}
export interface IProject extends Document {
    name: string;
    code: string;
    description?: string;
    client?: Types.ObjectId;
    category?: string;
    startDate?: Date;
    endDate?: Date;
    estimatedHours?: number;
    budget?: number;
    status: ProjectStatus;
    priority: Priority;
    members: IProjectMember[];
    progress: number;
    color: string;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const Project: PaginateModel<IProject> & Model<IProject, {}, {}, {}, Document<unknown, {}, IProject, {}, {}> & IProject & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=project.model.d.ts.map