import { z } from 'zod';

/**
 * Shared Zod schemas — used by both frontend forms and backend route validation.
 */

export const emailSchema = z.string().email({ message: 'Invalid email address' });

export const passwordSchema = z
  .string()
  .min(8, { message: 'Password must be at least 8 characters' })
  .max(128, { message: 'Password is too long' })
  .regex(/[A-Z]/, { message: 'Password must contain an uppercase letter' })
  .regex(/[a-z]/, { message: 'Password must contain a lowercase letter' })
  .regex(/[0-9]/, { message: 'Password must contain a number' });

export const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9-]+$/, { message: 'Only lowercase letters, numbers and hyphens allowed' });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: 'Password is required' }),
  tenantSlug: slugSchema.optional(),
  rememberMe: z.boolean().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    firstName: z.string().min(1, 'First name is required').max(64),
    lastName: z.string().min(1, 'Last name is required').max(64),
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    companyName: z.string().min(2).max(128),
    companySlug: slugSchema,
    acceptTerms: z.literal(true, {
      errorMap: () => ({ message: 'You must accept the terms and conditions' }),
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type SignupInput = z.infer<typeof signupSchema>;

export const tenantAddressSchema = z.object({
  line1: z.string().optional(),
  line2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  zip: z.string().optional(),
});

export const tenantSettingsSchema = z.object({
  timezone: z.string().default('Asia/Kolkata'),
  dateFormat: z.string().default('DD/MM/YYYY'),
  currency: z.string().default('INR'),
  language: z.string().default('en'),
  fiscalYearStart: z.string().default('04-01'),
});

export const tenantSchema = z.object({
  name: z.string().min(2).max(128),
  slug: slugSchema,
  domain: z.string().optional(),
  email: emailSchema,
  phone: z.string().optional(),
  logo: z.string().url().optional(),
  address: tenantAddressSchema.optional(),
  settings: tenantSettingsSchema.optional(),
});
export type TenantInput = z.infer<typeof tenantSchema>;

export const planSchema = z.object({
  name: z.string().min(2).max(64),
  slug: slugSchema,
  description: z.string().optional(),
  monthlyPrice: z.number().nonnegative(),
  yearlyPrice: z.number().nonnegative(),
  razorpayMonthlyPlanId: z.string().optional(),
  razorpayYearlyPlanId: z.string().optional(),
  maxUsers: z.number().int().positive(),
  maxStorageGB: z.number().int().positive(),
  modules: z.array(z.string()).default([]),
  features: z
    .object({
      customDomain: z.boolean().default(false),
      apiAccess: z.boolean().default(false),
      whiteLabel: z.boolean().default(false),
      prioritySupport: z.boolean().default(false),
    })
    .default({
      customDomain: false,
      apiAccess: false,
      whiteLabel: false,
      prioritySupport: false,
    }),
  trialDays: z.number().int().nonnegative().default(14),
  isActive: z.boolean().default(true),
  displayOrder: z.number().int().default(0),
});
export type PlanInput = z.infer<typeof planSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional(),
  search: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
