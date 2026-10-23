import { Schema, model } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';
const vehicleSchema = new Schema({
    type: { type: String, enum: ['bike', 'car', 'other'], required: true },
    label: { type: String, required: true, trim: true },
    ratePerKm: { type: Number, required: true, min: 0 },
}, { _id: false });
const checklistItemSchema = new Schema({
    label: { type: String, required: true, trim: true },
    kind: { type: String, enum: ['yes_no', 'text', 'number', 'select', 'photo'], required: true },
    options: { type: [String], default: undefined },
    required: { type: Boolean, default: false },
});
const checklistSchema = new Schema({
    name: { type: String, required: true, trim: true },
    purpose: { type: String, required: true, trim: true },
    items: { type: [checklistItemSchema], default: [] },
});
const fieldSettingsSchema = new Schema({
    singleton: { type: String, enum: ['field'], default: 'field', required: true },
    selfieRequired: { type: Boolean, required: true },
    defaultSiteRadiusM: { type: Number, required: true },
    siteTypes: { type: [String], required: true },
    visitPurposes: { type: [String], required: true },
    shortVisitMinutes: { type: Number, required: true },
    autoCloseTime: { type: String, required: true },
    offlineMaxAgeDays: { type: Number, required: true },
    visitCountsAsAttendance: { type: Boolean, required: true },
    vehicles: { type: [vehicleSchema], default: [] },
    checklists: { type: [checklistSchema], default: [] },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { collection: 'fieldsettings' });
fieldSettingsSchema.plugin(timestampPlugin);
fieldSettingsSchema.index({ singleton: 1 }, { unique: true });
export const FieldSettingsModel = model('FieldSettings', fieldSettingsSchema);
//# sourceMappingURL=field-settings.model.js.map