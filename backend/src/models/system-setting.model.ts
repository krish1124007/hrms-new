/**
 * Small key/value store for operator settings that must survive restarts and
 * deploys (e.g. `backup.monthlyEnabled`). One document per key.
 */
import { Schema, model, type Document } from 'mongoose';

export interface ISystemSetting extends Document {
  key: string;
  value: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingSchema = new Schema<ISystemSetting>(
  {
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
  },
  { collection: 'system_settings', timestamps: true },
);

export const SystemSetting = model<ISystemSetting>('SystemSetting', systemSettingSchema);

/** The stored value for `key`, or `fallback` when the key has never been set. */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const doc = await SystemSetting.findOne({ key }).lean().exec();
  return doc && doc.value !== undefined ? (doc.value as T) : fallback;
}

/** Create or replace the value stored under `key`. */
export async function setSetting(key: string, value: unknown): Promise<void> {
  await SystemSetting.updateOne({ key }, { $set: { value } }, { upsert: true }).exec();
}
