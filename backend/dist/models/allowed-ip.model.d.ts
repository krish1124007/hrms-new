import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IAllowedIP extends Document {
    label: string;
    ipAddress?: string;
    ipRangeStart?: string;
    ipRangeEnd?: string;
    locationId?: Types.ObjectId;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AllowedIP: PaginateModel<IAllowedIP> & Model<IAllowedIP, {}, {}, {}, Document<unknown, {}, IAllowedIP, {}, {}> & IAllowedIP & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=allowed-ip.model.d.ts.map