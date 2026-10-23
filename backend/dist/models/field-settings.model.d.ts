import { type Document, type Types } from 'mongoose';
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
export declare const FieldSettingsModel: import("mongoose").Model<IFieldSettings, {}, {}, {}, Document<unknown, {}, IFieldSettings, {}, {}> & IFieldSettings & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
//# sourceMappingURL=field-settings.model.d.ts.map