import { Schema, model, type Document, type Types } from 'mongoose';
import { timestampPlugin } from '../lib/mongoose-plugins.js';

/**
 * The company's Field Visits settings — one document (`singleton: 'field'`).
 * Read through `getFieldSettings()` (services/field-settings.service.ts),
 * which supplies the defaults while no document exists.
 */

export type VehicleType = 'bike' | 'car' | 'other';
export type ChecklistItemKind = 'yes_no' | 'text' | 'number' | 'select' | 'photo';

export interface IVehicleRate {
  type: VehicleType;
  label: string;
  ratePerKm: number;
}

export interface IChecklistItem {
  _id: Types.ObjectId;
  label: string;
  kind: ChecklistItemKind;
  options?: string[];
  required: boolean;
}

export interface IChecklist {
  _id: Types.ObjectId;
  name: string;
  /** The visit purpose this checklist is filled for. */
  purpose: string;
  items: IChecklistItem[];
}

export interface IFieldSettings extends Document {
  singleton: 'field';
  selfieRequired: boolean;
  defaultSiteRadiusM: number;
  siteTypes: string[];
  visitPurposes: string[];
  shortVisitMinutes: number;
  /** `HH:mm` (IST): visits still open at this time are closed by the nightly job. */
  autoCloseTime: string;
  offlineMaxAgeDays: number;
  visitCountsAsAttendance: boolean;
  vehicles: IVehicleRate[];
  checklists: IChecklist[];
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const vehicleSchema = new Schema<IVehicleRate>(
  {
    type: { type: String, enum: ['bike', 'car', 'other'], required: true },
    label: { type: String, required: true, trim: true },
    ratePerKm: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const checklistItemSchema = new Schema<IChecklistItem>({
  label: { type: String, required: true, trim: true },
  kind: { type: String, enum: ['yes_no', 'text', 'number', 'select', 'photo'], required: true },
  options: { type: [String], default: undefined },
  required: { type: Boolean, default: false },
});

const checklistSchema = new Schema<IChecklist>({
  name: { type: String, required: true, trim: true },
  purpose: { type: String, required: true, trim: true },
  items: { type: [checklistItemSchema], default: [] },
});

const fieldSettingsSchema = new Schema<IFieldSettings>(
  {
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
  },
  { collection: 'fieldsettings' },
);
fieldSettingsSchema.plugin(timestampPlugin);
fieldSettingsSchema.index({ singleton: 1 }, { unique: true });

export const FieldSettingsModel = model<IFieldSettings>('FieldSettings', fieldSettingsSchema);
