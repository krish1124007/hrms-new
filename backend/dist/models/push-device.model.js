import { Schema, model } from 'mongoose';
import { timestampPlugin, paginatePlugin } from '../lib/mongoose-plugins.js';
const pushDeviceSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    token: { type: String, required: true },
    platform: { type: String, enum: ['ios', 'android'], required: true },
    deviceName: String,
    osVersion: String,
    appVersion: String,
    lastSeenAt: { type: Date, default: Date.now },
});
pushDeviceSchema.plugin(timestampPlugin);
pushDeviceSchema.plugin(paginatePlugin);
// One token per device globally — if a user switches accounts on the same
// phone, the previous row is reassigned (not duplicated).
pushDeviceSchema.index({ token: 1 }, { unique: true });
pushDeviceSchema.index({ userId: 1 });
export const PushDevice = model('PushDevice', pushDeviceSchema);
//# sourceMappingURL=push-device.model.js.map