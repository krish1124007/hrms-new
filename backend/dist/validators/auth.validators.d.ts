import { z } from 'zod';
export declare const registerSchema: z.ZodObject<{
    firstName: z.ZodString;
    lastName: z.ZodString;
    email: z.ZodString;
    password: z.ZodString;
    acceptTerms: z.ZodOptional<z.ZodBoolean>;
    acceptPrivacy: z.ZodOptional<z.ZodBoolean>;
    marketingOptIn: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    termsVersion: z.ZodOptional<z.ZodString>;
    privacyVersion: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    marketingOptIn: boolean;
    acceptTerms?: boolean | undefined;
    acceptPrivacy?: boolean | undefined;
    termsVersion?: string | undefined;
    privacyVersion?: string | undefined;
}, {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    acceptTerms?: boolean | undefined;
    acceptPrivacy?: boolean | undefined;
    marketingOptIn?: boolean | undefined;
    termsVersion?: string | undefined;
    privacyVersion?: string | undefined;
}>;
export type RegisterInput = z.infer<typeof registerSchema>;
export declare const loginSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginInput = z.infer<typeof loginSchema>;
export declare const refreshTokenSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export declare const forgotPasswordSchema: z.ZodObject<{
    email: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
}, {
    email: string;
}>;
export declare const resetPasswordSchema: z.ZodObject<{
    token: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
    token: string;
}, {
    password: string;
    token: string;
}>;
export declare const changeMyPasswordSchema: z.ZodObject<{
    currentPassword: z.ZodString;
    newPassword: z.ZodString;
}, "strip", z.ZodTypeAny, {
    currentPassword: string;
    newPassword: string;
}, {
    currentPassword: string;
    newPassword: string;
}>;
export declare const updateMyProfileSchema: z.ZodObject<{
    firstName: z.ZodOptional<z.ZodString>;
    lastName: z.ZodOptional<z.ZodString>;
    avatar: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    avatar?: string | undefined;
}, {
    firstName?: string | undefined;
    lastName?: string | undefined;
    avatar?: string | undefined;
}>;
//# sourceMappingURL=auth.validators.d.ts.map