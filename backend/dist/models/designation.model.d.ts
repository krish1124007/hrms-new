import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IDesignation extends Document {
    name: string;
    department?: Types.ObjectId;
    level: number;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Designation: PaginateModel<IDesignation> & Model<IDesignation, {}, {}, {}, Document<unknown, {}, IDesignation, {}, {}> & IDesignation & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=designation.model.d.ts.map