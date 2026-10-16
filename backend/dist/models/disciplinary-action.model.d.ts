import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type DisciplinaryType = 'verbal_warning' | 'written_warning' | 'final_warning' | 'pip' | 'suspension' | 'termination' | 'other';
export type DisciplinarySeverity = 'low' | 'medium' | 'high' | 'critical';
export type DisciplinaryStatus = 'open' | 'acknowledged' | 'in_progress' | 'escalated' | 'resolved' | 'failed' | 'cancelled';
export interface IDisciplinaryAttachment {
    name: string;
    url: string;
    uploadedAt: Date;
}
export interface IDisciplinaryComment {
    author: Types.ObjectId;
    text: string;
    createdAt: Date;
}
export interface IDisciplinaryAction extends Document {
    caseNumber: string;
    employee: Types.ObjectId;
    type: DisciplinaryType;
    severity: DisciplinarySeverity;
    status: DisciplinaryStatus;
    title: string;
    description: string;
    incidentDate?: Date;
    issuedAt: Date;
    issuedBy: Types.ObjectId;
    acknowledgedAt?: Date | null;
    acknowledgementNotes?: string;
    resolutionDate?: Date | null;
    resolutionNotes?: string;
    pipStartDate?: Date | null;
    pipEndDate?: Date | null;
    pipGoals?: string;
    escalatedAt?: Date | null;
    escalatedTo?: Types.ObjectId | null;
    escalationReason?: string;
    confidential: boolean;
    attachments: IDisciplinaryAttachment[];
    comments: IDisciplinaryComment[];
    createdAt: Date;
    updatedAt: Date;
}
export declare const DisciplinaryAction: PaginateModel<IDisciplinaryAction> & Model<IDisciplinaryAction, {}, {}, {}, Document<unknown, {}, IDisciplinaryAction, {}, {}> & IDisciplinaryAction & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=disciplinary-action.model.d.ts.map