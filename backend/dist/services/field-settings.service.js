/**
 * Field Visits settings: the defaults, the cached read every field feature
 * uses (`getFieldSettings`), and the validated update behind PUT /settings.
 *
 * The read is cached in-process for 30 s; an update through this module
 * refreshes the cache at once. Another process (the job worker) may see an
 * update up to 30 s late.
 */
import { Types } from 'mongoose';
import { z } from 'zod';
import { FieldSettingsModel, } from '../models/field-settings.model.js';
import { env } from '../config/env.js';
/** What a company gets before anyone opens the settings page. */
export function defaultFieldSettings() {
    return {
        selfieRequired: true,
        defaultSiteRadiusM: 200,
        siteTypes: ['Client office', 'Project site', 'Branch', 'Vendor', 'Government office', 'Other'],
        visitPurposes: ['Meeting', 'Inspection', 'Audit', 'Survey', 'Installation', 'Maintenance', 'Training', 'Other'],
        shortVisitMinutes: 5,
        autoCloseTime: '23:30',
        offlineMaxAgeDays: 7,
        visitCountsAsAttendance: true,
        vehicles: [
            { type: 'bike', label: 'Two-wheeler', ratePerKm: 0 },
            { type: 'car', label: 'Car', ratePerKm: 0 },
        ],
        checklists: [],
    };
}
/* ── Cache ── */
const DEFAULT_TTL_MS = 30_000;
// Tests share one process per file; a cached value would leak between tests.
let ttlMs = env.NODE_ENV === 'test' ? 0 : DEFAULT_TTL_MS;
let cached = null;
/** Drop the cached settings (the next read goes to the database). */
export function resetFieldSettingsCache() {
    cached = null;
}
/** Tests: set the cache lifetime (0 disables caching). */
export function setFieldSettingsCacheTtl(ms) {
    ttlMs = ms;
    cached = null;
}
const clone = (s) => JSON.parse(JSON.stringify(s));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fromDocument(doc) {
    const d = defaultFieldSettings();
    const pick = (key) => doc?.[key] === undefined || doc?.[key] === null ? d[key] : doc[key];
    return {
        selfieRequired: pick('selfieRequired'),
        defaultSiteRadiusM: pick('defaultSiteRadiusM'),
        siteTypes: [...pick('siteTypes')],
        visitPurposes: [...pick('visitPurposes')],
        shortVisitMinutes: pick('shortVisitMinutes'),
        autoCloseTime: pick('autoCloseTime'),
        offlineMaxAgeDays: pick('offlineMaxAgeDays'),
        visitCountsAsAttendance: pick('visitCountsAsAttendance'),
        vehicles: pick('vehicles').map((v) => ({ type: v.type, label: v.label, ratePerKm: v.ratePerKm })),
        checklists: pick('checklists').map((c) => ({
            _id: String(c._id),
            name: c.name,
            purpose: c.purpose,
            items: c.items.map((i) => ({
                _id: String(i._id),
                label: i.label,
                kind: i.kind,
                ...(i.options && i.options.length > 0 ? { options: [...i.options] } : {}),
                required: Boolean(i.required),
            })),
        })),
    };
}
/** The current settings (defaults while none are saved); cached 30 s. */
export async function getFieldSettings() {
    const now = Date.now();
    if (cached && cached.expiresAt > now)
        return clone(cached.value);
    const doc = await FieldSettingsModel.findOne({ singleton: 'field' }).lean().exec();
    const value = fromDocument(doc);
    if (ttlMs > 0)
        cached = { value, expiresAt: now + ttlMs };
    return clone(value);
}
/* ── Update ── */
const label = (max) => z.string().trim().min(1).max(max);
const objectId = z.string().refine((v) => /^[a-f\d]{24}$/i.test(v), 'Invalid id');
/** A list of names: trimmed, non-empty, no case-insensitive duplicates. */
const nameList = (max) => z
    .array(label(60))
    .min(1)
    .max(max)
    .refine((list) => new Set(list.map((s) => s.toLowerCase())).size === list.length, 'Names must be unique');
const checklistItemInput = z
    .object({
    _id: objectId.optional(),
    label: label(200),
    kind: z.enum(['yes_no', 'text', 'number', 'select', 'photo']),
    options: z.array(label(100)).max(50).optional(),
    required: z.boolean().default(false),
})
    .superRefine((item, ctx) => {
    if (item.kind === 'select' && (!item.options || item.options.length === 0)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'A select item needs options' });
    }
});
const checklistInput = z.object({
    _id: objectId.optional(),
    name: label(100),
    purpose: label(60),
    items: z.array(checklistItemInput).min(1).max(100),
});
/** PUT /field/settings — any subset of the settings; omitted ones keep their value. */
export const updateFieldSettingsSchema = z
    .object({
    selfieRequired: z.boolean(),
    defaultSiteRadiusM: z.number().int().min(10).max(5000),
    siteTypes: nameList(50),
    visitPurposes: nameList(50),
    shortVisitMinutes: z.number().int().min(0).max(240),
    autoCloseTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour)'),
    offlineMaxAgeDays: z.number().int().min(1).max(30),
    visitCountsAsAttendance: z.boolean(),
    vehicles: z
        .array(z.object({
        type: z.enum(['bike', 'car', 'other']),
        label: label(60),
        ratePerKm: z.number().min(0).max(1000),
    }))
        .min(1)
        .max(3)
        .refine((list) => new Set(list.map((v) => v.type)).size === list.length, 'One rate per vehicle type'),
    checklists: z.array(checklistInput).max(50),
})
    .partial();
/**
 * Merge `patch` into the current settings and save them. Checklist purposes
 * must be among the (resulting) visit purposes. Returns the saved settings.
 */
export async function updateFieldSettings(patch, userId) {
    const current = await getFieldSettings();
    const merged = {
        ...current,
        ...patch,
        checklists: patch.checklists?.map((c) => ({
            _id: c._id ?? new Types.ObjectId().toHexString(),
            name: c.name,
            purpose: c.purpose,
            items: c.items.map((i) => ({
                _id: i._id ?? new Types.ObjectId().toHexString(),
                label: i.label,
                kind: i.kind,
                ...(i.kind === 'select' && i.options ? { options: i.options } : {}),
                required: i.required,
            })),
        })) ?? current.checklists,
    };
    const purposes = new Set(merged.visitPurposes.map((p) => p.toLowerCase()));
    const problems = merged.checklists
        .filter((c) => !purposes.has(c.purpose.toLowerCase()))
        .map((c) => `Checklist "${c.name}" is for "${c.purpose}", which is not a visit purpose`);
    if (problems.length > 0)
        return { settings: current, problems };
    await FieldSettingsModel.findOneAndUpdate({ singleton: 'field' }, {
        $set: {
            ...merged,
            checklists: merged.checklists.map((c) => ({
                ...c,
                _id: new Types.ObjectId(c._id),
                items: c.items.map((i) => ({ ...i, _id: new Types.ObjectId(i._id) })),
            })),
            ...(userId ? { updatedBy: userId } : {}),
        },
    }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    resetFieldSettingsCache();
    return { settings: await getFieldSettings(), problems: [] };
}
//# sourceMappingURL=field-settings.service.js.map