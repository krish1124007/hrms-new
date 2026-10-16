import type { Request, Response } from 'express';
import { z } from 'zod';
export declare const deleteAccountSchema: z.ZodObject<{
    password: z.ZodString;
    confirmation: z.ZodLiteral<"DELETE MY ACCOUNT">;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    password: string;
    confirmation: "DELETE MY ACCOUNT";
    reason?: string | undefined;
}, {
    password: string;
    confirmation: "DELETE MY ACCOUNT";
    reason?: string | undefined;
}>;
export declare function deleteMyAccount(req: Request, res: Response): Promise<void>;
export declare const recordConsentSchema: z.ZodObject<{
    consents: z.ZodObject<{
        termsOfService: z.ZodBoolean;
        privacyPolicy: z.ZodBoolean;
        marketing: z.ZodOptional<z.ZodBoolean>;
        analytics: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        termsOfService: boolean;
        privacyPolicy: boolean;
        marketing?: boolean | undefined;
        analytics?: boolean | undefined;
    }, {
        termsOfService: boolean;
        privacyPolicy: boolean;
        marketing?: boolean | undefined;
        analytics?: boolean | undefined;
    }>;
    documentVersions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    consents: {
        termsOfService: boolean;
        privacyPolicy: boolean;
        marketing?: boolean | undefined;
        analytics?: boolean | undefined;
    };
    documentVersions?: Record<string, string> | undefined;
}, {
    consents: {
        termsOfService: boolean;
        privacyPolicy: boolean;
        marketing?: boolean | undefined;
        analytics?: boolean | undefined;
    };
    documentVersions?: Record<string, string> | undefined;
}>;
export declare function recordConsent(req: Request, res: Response): Promise<void>;
export declare function complianceStatus(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=compliance.controller.d.ts.map