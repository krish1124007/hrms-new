/**
 * Shared API + Domain types.
 */

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: PaginationMeta;
}

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: ApiErrorDetail[];
  };
}

export type UserRole =
  | 'admin'
  | 'hr_manager'
  | 'hr_executive'
  | 'manager'
  | 'employee';

export type UserStatus = 'active' | 'inactive' | 'invited';

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatar?: string;
  role: string | Role;
  customPermissions?: string[];
  status: UserStatus;
  lastLogin?: string;
  emailVerified: boolean;
  twoFactorEnabled: boolean;
  loginMethod: 'email' | 'uid' | 'sso';
  createdAt: string;
  updatedAt: string;
}

export interface Role {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  isSystem: boolean;
}

export interface JwtPayload {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
}
