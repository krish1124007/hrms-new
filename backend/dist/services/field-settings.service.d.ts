import { z } from 'zod';
import { type ChecklistItemKind, type VehicleType } from '../models/field-settings.model.js';
export interface FieldSettings {
    selfieRequired: boolean;
    defaultSiteRadiusM: number;
    siteTypes: string[];
    visitPurposes: string[];
    shortVisitMinutes: number;
    autoCloseTime: string;
    offlineMaxAgeDays: number;
    visitCountsAsAttendance: boolean;
    vehicles: Array<{
        type: VehicleType;
        label: string;
        ratePerKm: number;
    }>;
    checklists: Array<{
        _id: string;
        name: string;
        purpose: string;
        items: Array<{
            _id: string;
            label: string;
            kind: ChecklistItemKind;
            options?: string[];
            required: boolean;
        }>;
    }>;
}
/** What a company gets before anyone opens the settings page. */
export declare function defaultFieldSettings(): FieldSettings;
/** Drop the cached settings (the next read goes to the database). */
export declare function resetFieldSettingsCache(): void;
/** Tests: set the cache lifetime (0 disables caching). */
export declare function setFieldSettingsCacheTtl(ms: number): void;
/** The current settings (defaults while none are saved); cached 30 s. */
export declare function getFieldSettings(): Promise<FieldSettings>;
/** PUT /field/settings — any subset of the settings; omitted ones keep their value. */
export declare const updateFieldSettingsSchema: z.ZodObject<{
    selfieRequired: z.ZodOptional<z.ZodBoolean>;
    defaultSiteRadiusM: z.ZodOptional<z.ZodNumber>;
    siteTypes: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    visitPurposes: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodString, "many">, string[], string[]>>;
    shortVisitMinutes: z.ZodOptional<z.ZodNumber>;
    autoCloseTime: z.ZodOptional<z.ZodString>;
    offlineMaxAgeDays: z.ZodOptional<z.ZodNumber>;
    visitCountsAsAttendance: z.ZodOptional<z.ZodBoolean>;
    vehicles: z.ZodOptional<z.ZodEffects<z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["bike", "car", "other"]>;
        label: z.ZodString;
        ratePerKm: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }, {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }>, "many">, {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }[], {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }[]>>;
    checklists: z.ZodOptional<z.ZodArray<z.ZodObject<{
        _id: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        name: z.ZodString;
        purpose: z.ZodString;
        items: z.ZodArray<z.ZodEffects<z.ZodObject<{
            _id: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            label: z.ZodString;
            kind: z.ZodEnum<["yes_no", "text", "number", "select", "photo"]>;
            options: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            required: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            required: boolean;
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            _id?: string | undefined;
        }, {
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            required?: boolean | undefined;
            _id?: string | undefined;
        }>, {
            required: boolean;
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            _id?: string | undefined;
        }, {
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            required?: boolean | undefined;
            _id?: string | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        items: {
            required: boolean;
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            _id?: string | undefined;
        }[];
        purpose: string;
        _id?: string | undefined;
    }, {
        name: string;
        items: {
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            required?: boolean | undefined;
            _id?: string | undefined;
        }[];
        purpose: string;
        _id?: string | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    selfieRequired?: boolean | undefined;
    defaultSiteRadiusM?: number | undefined;
    siteTypes?: string[] | undefined;
    visitPurposes?: string[] | undefined;
    shortVisitMinutes?: number | undefined;
    autoCloseTime?: string | undefined;
    offlineMaxAgeDays?: number | undefined;
    visitCountsAsAttendance?: boolean | undefined;
    vehicles?: {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }[] | undefined;
    checklists?: {
        name: string;
        items: {
            required: boolean;
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            _id?: string | undefined;
        }[];
        purpose: string;
        _id?: string | undefined;
    }[] | undefined;
}, {
    selfieRequired?: boolean | undefined;
    defaultSiteRadiusM?: number | undefined;
    siteTypes?: string[] | undefined;
    visitPurposes?: string[] | undefined;
    shortVisitMinutes?: number | undefined;
    autoCloseTime?: string | undefined;
    offlineMaxAgeDays?: number | undefined;
    visitCountsAsAttendance?: boolean | undefined;
    vehicles?: {
        type: "other" | "bike" | "car";
        label: string;
        ratePerKm: number;
    }[] | undefined;
    checklists?: {
        name: string;
        items: {
            label: string;
            kind: "number" | "text" | "select" | "photo" | "yes_no";
            options?: string[] | undefined;
            required?: boolean | undefined;
            _id?: string | undefined;
        }[];
        purpose: string;
        _id?: string | undefined;
    }[] | undefined;
}>;
export type FieldSettingsUpdate = z.infer<typeof updateFieldSettingsSchema>;
/**
 * Merge `patch` into the current settings and save them. Checklist purposes
 * must be among the (resulting) visit purposes. Returns the saved settings.
 */
export declare function updateFieldSettings(patch: FieldSettingsUpdate, userId?: unknown): Promise<{
    settings: FieldSettings;
    problems: string[];
}>;
//# sourceMappingURL=field-settings.service.d.ts.map