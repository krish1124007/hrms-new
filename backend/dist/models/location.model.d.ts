import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type LocationType = 'office' | 'branch' | 'warehouse' | 'site';
export interface ILocationCoordinates {
    lat: number;
    lng: number;
}
export interface ILocation extends Document {
    name: string;
    type: LocationType;
    address: string;
    coordinates?: ILocationCoordinates;
    phone?: string;
    manager?: Types.ObjectId;
    employees: Types.ObjectId[];
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;
}
export declare const Location: PaginateModel<ILocation> & Model<ILocation, {}, {}, {}, Document<unknown, {}, ILocation, {}, {}> & ILocation & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=location.model.d.ts.map