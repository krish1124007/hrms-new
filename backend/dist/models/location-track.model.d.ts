import { type Document, type Model, type Types } from 'mongoose';
export type TrackingActivityType = 'still' | 'walking' | 'running' | 'in_vehicle';
export interface ILocationGeo {
    type: 'Point';
    coordinates: [number, number];
}
/** How long a location fix is kept, counted from when the server received it. */
export declare const LOCATION_TRACK_RETENTION_SECONDS: number;
export interface ILocationTrack extends Document {
    employeeId: Types.ObjectId;
    /**
     * When the device took the fix (the API's `recordedAt`). Client-supplied:
     * the ingest bounds it (no older than 24 h, never in the future), and
     * retention never keys on it.
     */
    timestamp: Date;
    /** When the server stored the fix (server clock); retention (TTL) keys on this. */
    receivedAt: Date;
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