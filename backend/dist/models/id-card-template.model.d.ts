import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type IDCardOrientation = 'portrait' | 'landscape';
export interface IIDCardField {
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    style?: Record<string, unknown>;
}
export interface IIDCardLayout {
    background?: string;
    fields: IIDCardField[];
}
export interface IIDCardTemplate extends Document {
    name: string;
    layout: IIDCardLayout;
    orientation: IDCardOrientation;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export declare const IDCardTemplate: PaginateModel<IIDCardTemplate> & Model<IIDCardTemplate, {}, {}, {}, Document<unknown, {}, IIDCardTemplate, {}, {}> & IIDCardTemplate & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=id-card-template.model.d.ts.map