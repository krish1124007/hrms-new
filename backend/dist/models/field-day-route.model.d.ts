import { type Document, type Types } from 'mongoose';
/**
 * A measured day route (services/field-route.service.ts): the legs between
 * one employee's check-in/out points on one IST day. A cache, not a record —
 * reused while `signature` (the day's points) is unchanged, so road
 * distances are asked of Google once per day and again only when a new point
 * arrives. Collection `fielddayroutes`; one document per employee and day.
 */
export interface IFieldDayRouteLeg {
    fromIndex: number;
    toIndex: number;
    distanceM: number;
    estimated: boolean;
}
export interface IFieldDayRoute extends Document {
    employeeId: Types.ObjectId;
    /** IST calendar day, `YYYY-MM-DD`. */
    date: string;
    /** Hash of the day's ordered points the legs were measured for. */
    signature: string;
    legs: IFieldDayRouteLeg[];
    totalKm: number;
    estimated: boolean;
    computedAt: Date;
    /**
     * Set when the route fell back to the estimate while Google is configured
     * (a failure): it is reused until then, and measured again after.
     */
    retryAfter?: Date | null;
}
export declare const FieldDayRoute: import("mongoose").Model<IFieldDayRoute, {}, {}, {}, Document<unknown, {}, IFieldDayRoute, {}, {}> & IFieldDayRoute & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-day-route.model.d.ts.map