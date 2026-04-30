/**
 * Shared constants.
 */

export const ROLES = {
  ADMIN: 'admin',
  HR_MANAGER: 'hr_manager',
  HR_EXECUTIVE: 'hr_executive',
  MANAGER: 'manager',
  EMPLOYEE: 'employee',
} as const;

export type RoleSlug = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  EMPLOYEES_VIEW: 'employees.view',
  EMPLOYEES_CREATE: 'employees.create',
  EMPLOYEES_UPDATE: 'employees.update',
  EMPLOYEES_DELETE: 'employees.delete',
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_PROCESS: 'payroll.process',
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',
  LEAVES_VIEW: 'leaves.view',
  LEAVES_APPROVE: 'leaves.approve',
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',
  CRM_VIEW: 'crm.view',
  CRM_MANAGE: 'crm.manage',
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'hi', name: 'हिन्दी', rtl: false },
  { code: 'es', name: 'Español', rtl: false },
  { code: 'fr', name: 'Français', rtl: false },
  { code: 'de', name: 'Deutsch', rtl: false },
  { code: 'it', name: 'Italiano', rtl: false },
  { code: 'pt', name: 'Português', rtl: false },
  { code: 'ru', name: 'Русский', rtl: false },
  { code: 'zh', name: '中文', rtl: false },
  { code: 'ja', name: '日本語', rtl: false },
  { code: 'ko', name: '한국어', rtl: false },
  { code: 'ar', name: 'العربية', rtl: true },
  { code: 'he', name: 'עברית', rtl: true },
  { code: 'tr', name: 'Türkçe', rtl: false },
  { code: 'nl', name: 'Nederlands', rtl: false },
  { code: 'pl', name: 'Polski', rtl: false },
  { code: 'id', name: 'Bahasa Indonesia', rtl: false },
  { code: 'vi', name: 'Tiếng Việt', rtl: false },
] as const;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
