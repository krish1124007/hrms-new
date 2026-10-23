import type { Request, Response } from 'express';
export { updateFieldSettingsSchema } from '../services/field-settings.service.js';
/** GET /field/settings (field.view) → `FieldSettings`. */
export declare function getSettings(_req: Request, res: Response): Promise<void>;
/** PUT /field/settings (field.manage) — any subset; returns the saved settings. */
export declare function putSettings(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=field-settings.controller.d.ts.map