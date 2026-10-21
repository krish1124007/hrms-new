import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { loansApi, type LoanInput } from '@/lib/loans.api';


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
  });
}

export function usePreviewEmi() {
  return useMutation({
    mutationFn: (input: { principalAmount: number; interestRate: number; tenureMonths: number }) =>
      loansApi.previewEmi(input),
  });
}
