import { api } from './axios';
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

export interface ExpenseClaim {
  _id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeId?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category: string | { _id: string; name: string; code: string };
  amount: number;
  currency: string;
  date: string;
  description?: string;
  receiptUrls: ExpenseReceipt[];
  paymentMethod?: ExpensePaymentMethod;
  status: ExpenseClaimStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  approvedBy?: string | { _id: string; firstName: string; lastName: string; email: string };
  approvedAt?: string;
  rejectedReason?: string;
  reimbursedAt?: string;
  reimbursementRef?: string;
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
  approve: async (id: string): Promise<ItemResponse<ExpenseClaim>> =>
    (await api.patch(`/expense-claims/requests/${id}/approve`)).data,
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
