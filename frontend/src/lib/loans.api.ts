import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type LoanType =
  | 'salary_advance'
  | 'personal_loan'
  | 'emergency'
  | 'education'
  | 'medical'
  | 'other';

export type LoanStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'disbursed'
  | 'active'
  | 'closed'
  | 'cancelled';

export type InstallmentStatus = 'scheduled' | 'paid' | 'partial' | 'skipped' | 'overdue';

export interface LoanEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId: string;
  email?: string;
  profileImage?: string;
}

export interface LoanInstallment {
  _id?: string;
  installmentNumber: number;
  dueDate: string;
  amount: number;
  principalAmount: number;
  interestAmount: number;
  paidAmount: number;
  paidOn?: string | null;
  status: InstallmentStatus;
  notes?: string;
}

export interface Loan {
  _id: string;
  loanNumber: string;
  employee: LoanEmployeeRef;
  type: LoanType;
  principalAmount: number;
  interestRate: number;
  tenureMonths: number;
  emiAmount: number;
  totalPayable: number;
  totalInterest: number;
  status: LoanStatus;
  reason?: string;
  appliedAt: string;
  approvedBy?: { _id: string; firstName: string; lastName: string } | null;
  approvedAt?: string | null;
  rejectedReason?: string;
  disbursedOn?: string | null;
  startMonth?: string | null;
  closedAt?: string | null;
  installments: LoanInstallment[];
  outstandingPrincipal: number;
  outstandingTotal: number;
  totalPaid: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface LoanInput {
  employee: string;
  type?: LoanType;
  principalAmount: number;
  interestRate?: number;
  tenureMonths: number;
  reason?: string;
  startMonth?: string | Date;
  notes?: string;
}

export interface LoanStats {
  total: number;
  byStatus: Record<LoanStatus, number>;
  totalDisbursed: number;
  totalOutstanding: number;
  totalPaid: number;
}

export interface EmiPreview {
  emi: number;
  totalInterest: number;
  totalPayable: number;
  schedule: LoanInstallment[];
}

export const LOAN_TYPES: { value: LoanType; label: string }[] = [
  { value: 'salary_advance', label: 'Salary Advance' },
  { value: 'personal_loan', label: 'Personal Loan' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'education', label: 'Education' },
  { value: 'medical', label: 'Medical' },
  { value: 'other', label: 'Other' },
];

export const LOAN_STATUSES: { value: LoanStatus; label: string }[] = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'disbursed', label: 'Disbursed' },
  { value: 'active', label: 'Active' },
  { value: 'closed', label: 'Closed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export const loansApi = {
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Loan>> =>
    (await api.get('/loans', { params })).data,
  stats: async (): Promise<{ success: boolean; data: LoanStats }> =>
    (await api.get('/loans/stats')).data,
  get: async (id: string): Promise<ItemResponse<Loan>> => (await api.get(`/loans/${id}`)).data,
  create: async (input: LoanInput): Promise<ItemResponse<Loan>> =>
    (await api.post('/loans', input)).data,
  update: async (id: string, input: Partial<LoanInput>): Promise<ItemResponse<Loan>> =>
    (await api.patch(`/loans/${id}`, input)).data,
  remove: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/loans/${id}`)).data,
  approve: async (id: string, body: { notes?: string } = {}): Promise<ItemResponse<Loan>> =>
    (await api.post(`/loans/${id}/approve`, body)).data,
  reject: async (id: string, body: { reason: string }): Promise<ItemResponse<Loan>> =>
    (await api.post(`/loans/${id}/reject`, body)).data,
  disburse: async (
    id: string,
    body: { disbursedOn?: string | Date; startMonth?: string | Date } = {},
  ): Promise<ItemResponse<Loan>> => (await api.post(`/loans/${id}/disburse`, body)).data,
  recordPayment: async (
    id: string,
    body: { installmentId: string; amount: number; paidOn?: string | Date; notes?: string },
  ): Promise<ItemResponse<Loan>> => (await api.post(`/loans/${id}/payments`, body)).data,
  previewEmi: async (input: {
    principalAmount: number;
    interestRate: number;
    tenureMonths: number;
  }): Promise<{ success: boolean; data: EmiPreview }> =>
    (await api.post('/loans/preview-emi', input)).data,
};
