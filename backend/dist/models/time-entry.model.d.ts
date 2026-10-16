import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export interface ITimeEntry extends Document {
    projectId: Types.ObjectId;
    taskId?: Types.ObjectId;
    userId: Types.ObjectId;
    date: Date;
    hours: number;
    description?: string;
    isBillable: boolean;
    createdAt: Date;
    updatedAt: Date;
}
export declare const TimeEntry: PaginateModel<ITimeEntry> & Model<ITimeEntry, {}, {}, {}, Document<unknown, {}, ITimeEntry, {}, {}> & ITimeEntry & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=time-entry.model.d.ts.map