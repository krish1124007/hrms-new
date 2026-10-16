import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type GeofenceType = 'circle' | 'polygon';
export interface IGeofenceCenter {
    lat: number;
    lng: number;
}
export interface IGeofenceZone extends Document {
    name: string;
    type: GeofenceType;
    center?: IGeofenceCenter;
    radius?: number;
    coordinates: IGeofenceCenter[];
    autoCheckIn: boolean;
    autoCheckOut: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const GeofenceZone: PaginateModel<IGeofenceZone> & Model<IGeofenceZone, {}, {}, {}, Document<unknown, {}, IGeofenceZone, {}, {}> & IGeofenceZone & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=geofence-zone.model.d.ts.map