import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { overtimeApi, type OvertimeInput } from '@/lib/overtime.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

export function useOvertimeRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['overtime', params],
    queryFn: () => overtimeApi.list(params),
  });
}

export function useMyOvertimeRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['overtime', 'mine', params],
    queryFn: () => overtimeApi.listMine(params),
  });
}

export function useOvertimeStats() {
  return useQuery({
    queryKey: ['overtime', 'stats'],
    queryFn: () => overtimeApi.stats(),
  });
}

export function useOvertimeRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['overtime', id],
    queryFn: () => overtimeApi.get(id as string),
    enabled: !!id,
  });
}

export function useCreateOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OvertimeInput) => overtimeApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      toast.success('Overtime request submitted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to submit overtime request')),
  });
}

export function useUpdateOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<OvertimeInput> }) =>
      overtimeApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      toast.success('Request updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update')),
  });
}

export function useDeleteOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => overtimeApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      toast.success('Request withdrawn');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to withdraw')),
  });
}

export function useApproveOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) =>
      overtimeApi.approve(id, { notes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      toast.success('Approved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to approve')),
  });
}

export function useRejectOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      overtimeApi.reject(id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overtime'] });
      toast.success('Rejected');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to reject')),
  });
}
