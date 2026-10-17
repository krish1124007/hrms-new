/**
 * Small key/value store for operator settings that must survive restarts and
 * deploys (e.g. `backup.monthlyEnabled`). One document per key.
 */
import { Schema, model } from 'mongoose';
const systemSettingSchema = new Schema({
    key: { type: String, required: true, unique: true },
    value: Schema.Types.Mixed,
}, { collection: 'system_settings', timestamps: true });
export const SystemSetting = model('SystemSetting', systemSettingSchema);
/** The stored value for `key`, or `fallback` when the key has never been set. */
export async function getSetting(key, fallback) {
    const doc = await SystemSetting.findOne({ key }).lean().exec();
    return doc && doc.value !== undefined ? doc.value : fallback;
}
/** Create or replace the value stored under `key`. */
export async function setSetting(key, value) {
    await SystemSetting.updateOne({ key }, { $set: { value } }, { upsert: true }).exec();
}
//# sourceMappingURL=system-setting.model.js.map