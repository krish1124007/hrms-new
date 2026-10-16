import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type DocumentAccessLevel = 'private' | 'department' | 'all';
export interface IDocumentFile {
    url: string;
    size: number;
    mimeType: string;
    key: string;
}
export interface IDocumentShare {
    userId?: Types.ObjectId;
    departmentId?: Types.ObjectId;
}
export interface IDocument extends Document {
    name: string;
    category?: string;
    folder: string;
    file: IDocumentFile;
    uploadedBy: Types.ObjectId;
    sharedWith: IDocumentShare[];
    accessLevel: DocumentAccessLevel;
    version: number;
    previousVersion?: Types.ObjectId;
    expiryDate?: Date;
    tags: string[];
    downloadCount: number;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export declare const DocumentModel: PaginateModel<IDocument> & Model<IDocument, {}, {}, {}, Document<unknown, {}, IDocument, {}, {}> & IDocument & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=document.model.d.ts.map