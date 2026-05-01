import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  expenseCategoriesApi,
  expenseClaimsApi,
  type ExpenseCategoryInput,
  type ExpenseClaimInput,
} from '@/lib/expense-claims.api';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

/* ── Categories ── */
export function useExpenseCategories(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['expense-categories', params],
    queryFn: () => expenseCategoriesApi.list(params),
  });
}
export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseCategoryInput) => expenseCategoriesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Category created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create category')),
  });
}
export function useUpdateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExpenseCategoryInput> }) =>
      expenseCategoriesApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Category updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update category')),
  });
}
export function useDeleteExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseCategoriesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-categories'] });
      toast.success('Category deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete category')),
  });
}

/* ── Claims ── */
export function useExpenseClaims(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['expense-claims', params],
    queryFn: () => expenseClaimsApi.list(params),
  });
}
export function useMyExpenseClaims(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['expense-claims', 'my', params],
    queryFn: () => expenseClaimsApi.my(params),
  });
}
export function useTeamExpenseClaims(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['expense-claims', 'team', params],
    queryFn: () => expenseClaimsApi.team(params),
  });
}
export function useExpenseClaim(id: string | undefined) {
  return useQuery({
    queryKey: ['expense-claims', id],
    queryFn: () => expenseClaimsApi.get(id as string),
    enabled: !!id,
  });
}
export function useCreateExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseClaimInput) => expenseClaimsApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Expense claim submitted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to submit expense claim')),
  });
}
export function useUpdateExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<ExpenseClaimInput> }) =>
      expenseClaimsApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update claim')),
  });
}
export function useDeleteExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseClaimsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete claim')),
  });
}
export function useApproveExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => expenseClaimsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim approved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to approve claim')),
  });
}
export function useRejectExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      expenseClaimsApi.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim rejected');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to reject claim')),
  });
}
export function useReimburseExpenseClaim() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reimbursementRef }: { id: string; reimbursementRef?: string }) =>
      expenseClaimsApi.reimburse(id, reimbursementRef),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-claims'] });
      toast.success('Claim reimbursed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to reimburse claim')),
  });
}
export function useExpenseReports(year?: number) {
  return useQuery({
    queryKey: ['expense-reports', year],
    queryFn: () => expenseClaimsApi.reports(year),
  });
}
