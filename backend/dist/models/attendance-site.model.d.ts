import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface ISiteLocation {
    lat: number;
    lng: number;
}
export interface IAttendanceSite extends Document {
    name: string;
    address?: string;
    location: ISiteLocation;
    radius: number;
    assignedEmployees: Types.ObjectId[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const AttendanceSite: PaginateModel<IAttendanceSite> & Model<IAttendanceSite, {}, {}, {}, Document<unknown, {}, IAttendanceSite, {}, {}> & IAttendanceSite & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=attendance-site.model.d.ts.map