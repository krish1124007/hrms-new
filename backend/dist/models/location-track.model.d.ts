import { type Document, type Model, type Types } from 'mongoose';
export type TrackingActivityType = 'still' | 'walking' | 'running' | 'in_vehicle';
export interface ILocationGeo {
    type: 'Point';
    coordinates: [number, number];
}
export interface ILocationTrack extends Document {
    employeeId: Types.ObjectId;
    timestamp: Date;
    location: ILocationGeo;
    accuracy?: number;
    speed?: number;
    altitude?: number;
    heading?: number;
    activity?: TrackingActivityType;
    battery?: number;
    isCharging?: boolean;
    networkType?: string;
    isOffline?: boolean;
    syncedAt?: Date;
}
export declare const LocationTrack: Model<ILocationTrack, {}, {}, {}, Document<unknown, {}, ILocationTrack, {}, {}> & ILocationTrack & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=location-track.model.d.ts.map