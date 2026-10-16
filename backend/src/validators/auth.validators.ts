import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().min(1).max(64),
  lastName: z.string().min(1).max(64),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  acceptTerms: z.boolean().optional(),
  acceptPrivacy: z.boolean().optional(),
  marketingOptIn: z.boolean().optional().default(false),
  termsVersion: z.string().optional(),
  privacyVersion: z.string().optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(10),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password: z.string().min(8).max(128),
});

export const changeMyPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export const updateMyProfileSchema = z.object({
  firstName: z.string().min(1).max(64).optional(),
  lastName: z.string().min(1).max(64).optional(),
  avatar: z.string().url().optional(),
});
