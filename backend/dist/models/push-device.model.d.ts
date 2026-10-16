import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
/**
 * Per-user push-notification device registry.
 *
 * One user may have multiple devices (phone, tablet). We broadcast pushes
 * to every device tied to the target `userId`.
 *
 * Tokens expire — Firebase rotates them when the app is reinstalled, a
 * device is restored, etc. The client calls POST /notifications/devices
 * with the fresh token; we upsert so we don't accumulate duplicates.
 */
export interface IPushDevice extends Document {
    userId: Types.ObjectId;
    token: string;
    platform: 'ios' | 'android';
    deviceName?: string;
    osVersion?: string;
    appVersion?: string;
    lastSeenAt: Date;
    createdAt: Date;
    updatedAt: Date;
}
export declare const PushDevice: PaginateModel<IPushDevice> & Model<IPushDevice, {}, {}, {}, Document<unknown, {}, IPushDevice, {}, {}> & IPushDevice & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=push-device.model.d.ts.map