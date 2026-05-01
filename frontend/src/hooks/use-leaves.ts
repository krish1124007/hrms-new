import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  leaveTypesApi,
  leaveBalancesApi,
  leaveRequestsApi,
  type LeaveTypeInput,
  type LeaveRequestInput,
  type AllocateBalanceInput,
} from '@/lib/leaves.api';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

/* ── Leave Types ── */
export function useLeaveTypes(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['leave-types', params],
    queryFn: () => leaveTypesApi.list(params),
  });
}
export function useLeaveType(id: string | undefined) {
  return useQuery({
    queryKey: ['leave-types', id],
    queryFn: () => leaveTypesApi.get(id as string),
    enabled: !!id,
  });
}
export function useCreateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeaveTypeInput) => leaveTypesApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-types'] });
      toast.success('Leave type created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create leave type')),
  });
}
export function useUpdateLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<LeaveTypeInput> }) =>
      leaveTypesApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-types'] });
      toast.success('Leave type updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update leave type')),
  });
}
export function useDeleteLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveTypesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-types'] });
      toast.success('Leave type deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete leave type')),
  });
}

/* ── Leave Balances ── */
export function useLeaveBalances(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['leave-balances', params],
    queryFn: () => leaveBalancesApi.list(params),
  });
}
export function useMyLeaveBalances(year?: number) {
  return useQuery({
    queryKey: ['leave-balances', 'my', year],
    queryFn: () => leaveBalancesApi.my(year),
  });
}
export function useAllocateLeaveBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AllocateBalanceInput) => leaveBalancesApi.allocate(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave balances allocated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to allocate balances')),
  });
}
export function useAdjustLeaveBalance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, delta, reason }: { id: string; delta: number; reason?: string }) =>
      leaveBalancesApi.adjust(id, delta, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Balance adjusted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to adjust balance')),
  });
}

/* ── Leave Requests ── */
export function useLeaveRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['leave-requests', params],
    queryFn: () => leaveRequestsApi.list(params),
  });
}
export function useMyLeaveRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['leave-requests', 'my', params],
    queryFn: () => leaveRequestsApi.my(params),
  });
}
export function useTeamLeaveRequests(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['leave-requests', 'team', params],
    queryFn: () => leaveRequestsApi.team(params),
  });
}
export function useLeaveCalendar(from?: string, to?: string) {
  return useQuery({
    queryKey: ['leave-requests', 'calendar', from, to],
    queryFn: () => leaveRequestsApi.calendar(from, to),
  });
}
export function useLeaveRequest(id: string | undefined) {
  return useQuery({
    queryKey: ['leave-requests', id],
    queryFn: () => leaveRequestsApi.get(id as string),
    enabled: !!id,
  });
}
export function useApplyLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LeaveRequestInput) => leaveRequestsApi.apply(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave request submitted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to submit leave request')),
  });
}
export function useApproveLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveRequestsApi.approve(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave approved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to approve leave')),
  });
}
export function useRejectLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      leaveRequestsApi.reject(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      toast.success('Leave rejected');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to reject leave')),
  });
}
export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveRequestsApi.cancel(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave cancelled');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to cancel leave')),
  });
}
export function useLeaveReports(year?: number) {
  return useQuery({
    queryKey: ['leave-reports', year],
    queryFn: () => leaveRequestsApi.reports(year),
  });
}
