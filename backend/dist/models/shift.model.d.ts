import { type Document, type Model } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface IShift extends Document {
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
    halfDayHours: number;
    fullDayHours: number;
    workDays: number[];
    isNightShift: boolean;
    breakDuration: number;
    isDefault: boolean;
    color: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Shift: PaginateModel<IShift> & Model<IShift, {}, {}, {}, Document<unknown, {}, IShift, {}, {}> & IShift & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=shift.model.d.ts.map