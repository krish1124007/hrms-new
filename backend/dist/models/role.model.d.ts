import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IRole extends Document {
    name: string;
    slug: string;
    description?: string;
    permissions: string[];
    isSystem: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Role: PaginateModel<IRole> & Model<IRole, {}, {}, {}, Document<unknown, {}, IRole, {}, {}> & IRole & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
export declare const DEFAULT_ROLES: Array<{
    name: string;
    slug: string;
    description: string;
    permissions: string[];
    isSystem: boolean;
}>;
//# sourceMappingURL=role.model.d.ts.map