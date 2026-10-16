import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type PolicyCategory = 'general' | 'code_of_conduct' | 'leave' | 'attendance' | 'compensation' | 'benefits' | 'safety' | 'security' | 'data_privacy' | 'remote_work' | 'travel' | 'expenses' | 'harassment' | 'grievance' | 'it' | 'other';
export type PolicyStatus = 'draft' | 'published' | 'archived';
export interface IPolicyVersion {
    versionNumber: number;
    content: string;
    changeNotes?: string;
    publishedAt?: Date | null;
    publishedBy?: Types.ObjectId | null;
    effectiveDate?: Date | null;
}
export interface IPolicyAcknowledgement {
    employee: Types.ObjectId;
    versionNumber: number;
    acknowledgedAt: Date;
    comment?: string;
}
export interface IHrPolicy extends Document {
    policyCode: string;
    title: string;
    category: PolicyCategory;
    status: PolicyStatus;
    summary?: string;
    content: string;
    currentVersion: number;
    versions: IPolicyVersion[];
    effectiveDate?: Date | null;
    reviewDueDate?: Date | null;
    mandatory: boolean;
    acknowledgements: IPolicyAcknowledgement[];
    tags: string[];
    attachments: {
        name: string;
        url: string;
        uploadedAt: Date;
    }[];
    ownerUser?: Types.ObjectId | null;
    createdAt: Date;
    updatedAt: Date;
}
export declare const HrPolicy: PaginateModel<IHrPolicy> & Model<IHrPolicy, {}, {}, {}, Document<unknown, {}, IHrPolicy, {}, {}> & IHrPolicy & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=hr-policy.model.d.ts.map