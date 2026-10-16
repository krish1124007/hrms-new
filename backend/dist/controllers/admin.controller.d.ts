import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const testEmailSchema: z.ZodObject<{
    to: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    to?: string | undefined;
}, {
    to?: string | undefined;
}>;
/**
 * Verifies the SMTP transport is configured + reachable, then optionally
 * sends a real test email. Admin-only.
 */
export declare function testEmail(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=admin.controller.d.ts.map