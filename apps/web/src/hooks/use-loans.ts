import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { loansApi, type LoanInput } from '@/lib/loans.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

export function useLoans(params?: Record<string, unknown>) {
  return useQuery({ queryKey: ['loans', params], queryFn: () => loansApi.list(params) });
}

export function useLoan(id: string | undefined) {
  return useQuery({
    queryKey: ['loans', id],
    queryFn: () => loansApi.get(id as string),
    enabled: !!id,
  });
}

export function useLoanStats() {
  return useQuery({ queryKey: ['loans', 'stats'], queryFn: () => loansApi.stats() });
}

export function useCreateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoanInput) => loansApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast.success('Loan application created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create loan')),
  });
}

export function useUpdateLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LoanInput> }) =>
      loansApi.update(id, input),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loans', v.id] });
      toast.success('Loan updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update loan')),
  });
}

export function useDeleteLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => loansApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      toast.success('Loan deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete loan')),
  });
}

export function useApproveLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      loansApi.approve(id, { notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loans', v.id] });
      toast.success('Loan approved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to approve loan')),
  });
}

export function useRejectLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      loansApi.reject(id, { reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loans', v.id] });
      toast.success('Loan rejected');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to reject loan')),
  });
}

export function useDisburseLoan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      disbursedOn,
      startMonth,
    }: {
      id: string;
      disbursedOn?: string | Date;
      startMonth?: string | Date;
    }) => loansApi.disburse(id, { disbursedOn, startMonth }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loans', v.id] });
      toast.success('Loan disbursed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to disburse')),
  });
}

export function useRecordLoanPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      installmentId,
      amount,
      paidOn,
      notes,
    }: {
      id: string;
      installmentId: string;
      amount: number;
      paidOn?: string | Date;
      notes?: string;
    }) => loansApi.recordPayment(id, { installmentId, amount, paidOn, notes }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['loans'] });
      qc.invalidateQueries({ queryKey: ['loans', v.id] });
      toast.success('Payment recorded');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to record payment')),
  });
}

export function usePreviewEmi() {
  return useMutation({
    mutationFn: (input: { principalAmount: number; interestRate: number; tenureMonths: number }) =>
      loansApi.previewEmi(input),
  });
}
