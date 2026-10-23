import { ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import { getFieldSettings, updateFieldSettings, } from '../services/field-settings.service.js';
export { updateFieldSettingsSchema } from '../services/field-settings.service.js';
/** GET /field/settings (field.view) → `FieldSettings`. */
export async function getSettings(_req, res) {
    res.json({ success: true, data: await getFieldSettings() });
}
/** PUT /field/settings (field.manage) — any subset; returns the saved settings. */
export async function putSettings(req, res) {
    const { settings, problems } = await updateFieldSettings(req.body, req.user?._id);
    if (problems.length > 0) {
        throw new ValidationAppError('Validation failed', problems.map((message) => ({ field: 'checklists', message, code: 'custom' })));
    }
    void audit({ action: 'update', entity: 'FieldSettings', entityId: 'field' });
    res.json({ success: true, data: settings });
}
//# sourceMappingURL=field-settings.controller.js.map