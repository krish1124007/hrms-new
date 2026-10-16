import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type HolidayType = 'public' | 'optional' | 'restricted';
export interface IHoliday extends Document {
    name: string;
    date: Date;
    type: HolidayType;
    departments: Types.ObjectId[];
    isRecurring: boolean;
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}
export declare const Holiday: PaginateModel<IHoliday> & Model<IHoliday, {}, {}, {}, Document<unknown, {}, IHoliday, {}, {}> & IHoliday & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=holiday.model.d.ts.map