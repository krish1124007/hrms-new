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
  });
}

/** Opens a leave year (allocation + carry forward) for every active employee. */
export function useOpenLeaveYear() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (year: number) => leaveBalancesApi.openYear(year),
    onSuccess: (d, year) => {
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      const { created, carried, skipped } = d.data;
      toast.success(
        `Opened ${year}: ${created} balance(s) created, ${carried} carried forward, ${skipped} already set`,
      );
    },
  });
}

export function useResetLeaveBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ year, leaveTypeId }: { year: number; leaveTypeId?: string }) =>
      leaveBalancesApi.reset(year, leaveTypeId),
    onSuccess: (_d, { year }) => {
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success(`Used and carried-forward days for ${year} reset to 0`);
    },
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
  });
}
export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => leaveRequestsApi.cancel(id, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave cancelled');
    },
  });
}
export function useDeleteLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => leaveRequestsApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['leave-requests'] });
      qc.invalidateQueries({ queryKey: ['leave-balances'] });
      toast.success('Leave request deleted and balance restored');
    },
  });
}
export function useLeaveReports(year?: number) {
  return useQuery({
    queryKey: ['leave-reports', year],
    queryFn: () => leaveRequestsApi.reports(year),
  });
}
