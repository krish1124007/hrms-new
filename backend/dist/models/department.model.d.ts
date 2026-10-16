import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type DepartmentStatus = 'active' | 'inactive';
export interface IDepartment extends Document {
    name: string;
    code: string;
    description?: string;
    head?: Types.ObjectId;
    parentDepartment?: Types.ObjectId;
    status: DepartmentStatus;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Department: PaginateModel<IDepartment> & Model<IDepartment, {}, {}, {}, Document<unknown, {}, IDepartment, {}, {}> & IDepartment & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=department.model.d.ts.map