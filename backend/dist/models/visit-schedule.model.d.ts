import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/**
 * A recurring visit: `employeeId` visits `siteId` every week on `weekdays`
 * (1 = Mon … 7 = Sun) or every month on `dayOfMonth` (1–28), from
 * `startDate` until `endDate` (inclusive, IST day labels). The nightly field
 * run turns it into planned visits 7 days ahead (one per schedule and date).
 */
export type ScheduleFreq = 'weekly' | 'monthly';
export interface IScheduleRule {
    freq: ScheduleFreq;
    weekdays?: number[];
    dayOfMonth?: number;
    startDate: Date;
    endDate?: Date;
}
export interface IVisitSchedule extends Document {
    employeeId: Types.ObjectId;
    siteId: Types.ObjectId;
    purpose: string;
    notes?: string;
    rule: IScheduleRule;
    createdBy?: Types.ObjectId;
    isDeleted?: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const VisitSchedule: PaginateModel<IVisitSchedule> & Model<IVisitSchedule, {}, {}, {}, Document<unknown, {}, IVisitSchedule, {}, {}> & IVisitSchedule & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=visit-schedule.model.d.ts.map