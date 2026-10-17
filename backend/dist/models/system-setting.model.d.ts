/**
 * Small key/value store for operator settings that must survive restarts and
 * deploys (e.g. `backup.monthlyEnabled`). One document per key.
 */
import { type Document } from 'mongoose';
export interface ISystemSetting extends Document {
    key: string;
    value: unknown;
    createdAt: Date;
    updatedAt: Date;
}
export declare const SystemSetting: import("mongoose").Model<ISystemSetting, {}, {}, {}, Document<unknown, {}, ISystemSetting, {}, {}> & ISystemSetting & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>;
/** The stored value for `key`, or `fallback` when the key has never been set. */
export declare function getSetting<T>(key: string, fallback: T): Promise<T>;
/** Create or replace the value stored under `key`. */
export declare function setSetting(key: string, value: unknown): Promise<void>;
//# sourceMappingURL=system-setting.model.d.ts.map