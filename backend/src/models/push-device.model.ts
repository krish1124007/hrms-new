import { Schema, model, type Document, type Model, type Types } from 'mongoose';
import { timestampPlugin, paginatePlugin, type PaginateModel } from '../lib/mongoose-plugins.js';

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

const pushDeviceSchema = new Schema<IPushDevice>({
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

export const PushDevice = model<IPushDevice, PaginateModel<IPushDevice> & Model<IPushDevice>>(
  'PushDevice',
  pushDeviceSchema,
);
