import type { Request, Response } from 'express';
import { ValidationAppError } from '../lib/errors.js';
import { audit } from '../services/audit.service.js';
import {
  getFieldSettings,
  updateFieldSettings,
  type FieldSettingsUpdate,
} from '../services/field-settings.service.js';

export { updateFieldSettingsSchema } from '../services/field-settings.service.js';

/** GET /field/settings (field.view) → `FieldSettings`. */
export async function getSettings(_req: Request, res: Response): Promise<void> {
  res.json({ success: true, data: await getFieldSettings() });
}

/** PUT /field/settings (field.manage) — any subset; returns the saved settings. */
export async function putSettings(req: Request, res: Response): Promise<void> {
  const { settings, problems } = await updateFieldSettings(req.body as FieldSettingsUpdate, req.user?._id);
  if (problems.length > 0) {
    throw new ValidationAppError(
      'Validation failed',
      problems.map((message) => ({ field: 'checklists', message, code: 'custom' })),
    );
  }
  void audit({ action: 'update', entity: 'FieldSettings', entityId: 'field' });
  res.json({ success: true, data: settings });
}
