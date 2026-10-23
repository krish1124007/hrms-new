import { api } from './axios';
import type { VehicleType } from './field.api';
import type { RouteLeg, RoutePoint } from './field-route';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type ExpenseClaimStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'reimbursed';
export type ExpensePaymentMethod = 'cash' | 'bank' | 'card' | 'upi' | 'cheque' | 'other';

/* ── Category ── */
export interface ExpenseCategory {
  _id: string;
  name: string;
  code: string;
  description?: string;
  limit?: number;
  requiresReceipt: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseCategoryInput {
  name: string;
  code: string;
  description?: string;
  limit?: number;
  requiresReceipt?: boolean;
  isActive?: boolean;
}

export const expenseCategoriesApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<ExpenseCategory>> =>
    (await api.get('/expense-claims/categories', { params })).data,
  get: async (id: string): Promise<ItemResponse<ExpenseCategory>> =>
    (await api.get(`/expense-claims/categories/${id}`)).data,
  create: async (input: ExpenseCategoryInput): Promise<ItemResponse<ExpenseCategory>> =>
    (await api.post('/expense-claims/categories', input)).data,
  update: async (
    id: string,
    input: Partial<ExpenseCategoryInput>,
  ): Promise<ItemResponse<ExpenseCategory>> =>
    (await api.patch(`/expense-claims/categories/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/expense-claims/categories/${id}`)).data,
};

/* ── Claim ── */
export interface ExpenseReceipt {
  name: string;
  fileUrl: string;
  uploadedAt: string;
}

/** How a travel allowance claim was worked out (claims made from `POST /field/travel/claims`). */
export interface ExpenseTravel {
  /** The IST day travelled, `YYYY-MM-DD`. */
  date: string;
  vehicleType: VehicleType;
  ratePerKm: number;
  /** Km measured between the day's check-in/out points. */
  computedKm: number;
  /** Km the employee claimed (equal to `computedKm` unless corrected). */
  claimedKm: number;
  /** Road distance was unavailable for part of the day — straight line × 1.3. */
  estimated: boolean;
  /** Why the claimed km differs from the calculation (required above 5 %). */
  reason?: string;
  /** The day's check-in/out points as measured when the claim was made. */
  points: RoutePoint[];
  /** The legs measured between those points (indices into `points`). */
  legs: RouteLeg[];
}

export interface ExpenseClaim {
  _id: string;
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeId?: string };
  category: string | { _id: string; name: string; code: string };
  amount: number;
  acceptedAmount?: number;
  currency: string;
  date: string;
  description?: string;
  receiptUrls: ExpenseReceipt[];
  paymentMethod?: ExpensePaymentMethod;
  status: ExpenseClaimStatus;
  approvedBy?: string | { _id: string; firstName: string; lastName: string; email: string };
  approvedAt?: string;
  rejectedReason?: string;
  reimbursedAt?: string;
  reimbursementRef?: string;
  /** Set on travel allowance claims. */
  travel?: ExpenseTravel;
  /** The id of the field visit this expense was incurred at, if linked (never populated). */
  visitId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseClaimInput {
  employeeId?: string;
  category: string;
  amount: number;
  currency?: string;
  date: string;
  description?: string;
  receiptUrls?: { name: string; fileUrl: string }[];
  paymentMethod?: ExpensePaymentMethod;
  status?: 'draft' | 'pending';
  /** Link the expense to the field visit it belongs to. */
  visitId?: string;
}

export interface ExpenseReports {
  year: number;
  byStatus: { _id: string; n: number; amount: number }[];
  byCategory: { categoryId: string; name?: string; amount: number }[];
  byMonth: { month: number; amount: number }[];
  totalApproved: number;
}

export const expenseClaimsApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<ExpenseClaim>> =>
    (await api.get('/expense-claims/requests', { params })).data,
  my: async (params?: Record<string, unknown>): Promise<ListResponse<ExpenseClaim>> =>
    (await api.get('/expense-claims/requests/my', { params })).data,
  team: async (params?: Record<string, unknown>): Promise<ListResponse<ExpenseClaim>> =>
    (await api.get('/expense-claims/requests/team', { params })).data,
  get: async (id: string): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.get(`/expense-claims/requests/${id}`)).data,
  create: async (input: ExpenseClaimInput): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.post('/expense-claims/requests', input)).data,
  update: async (
    id: string,
    input: Partial<ExpenseClaimInput>,
  ): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.patch(`/expense-claims/requests/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/expense-claims/requests/${id}`)).data,
  approve: async (id: string, acceptedAmount?: number): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.patch(`/expense-claims/requests/${id}/approve`, { acceptedAmount })).data,
  reject: async (id: string, reason: string): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.patch(`/expense-claims/requests/${id}/reject`, { reason })).data,
  reimburse: async (
    id: string,
    reimbursementRef?: string,
  ): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.patch(`/expense-claims/requests/${id}/reimburse`, { reimbursementRef })).data,
  reports: async (year?: number): Promise<{ success: boolean; data: ExpenseReports }> =>
    (await api.get('/expense-claims/reports', { params: { year } })).data,
};
