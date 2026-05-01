import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fieldApi,
  type FieldClientInput,
  type VisitInput,
  type FieldTaskInput,
  type SalesTargetInput,
  type ProductOrderInput,
  type PaymentCollectionInput,
  type OrderStatus,
  type VisitCheckpoint,
  type VisitOutcome,
  type VisitPurpose,
  type TargetType,
} from '@/lib/field.api';

const errMsg = (err: unknown, fallback: string): string => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

/* ── Dashboard ── */
export function useFieldDashboard() {
  return useQuery({
    queryKey: ['field-dashboard'],
    queryFn: () => fieldApi.dashboard(),
  });
}

/* ── Clients ── */
export function useFieldClients(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-clients', params],
    queryFn: () => fieldApi.listClients(params),
  });
}
export function useFieldClient(id: string | undefined) {
  return useQuery({
    queryKey: ['field-client', id],
    queryFn: () => fieldApi.getClient(id as string),
    enabled: !!id,
  });
}
export function useClientsMap() {
  return useQuery({
    queryKey: ['field-clients-map'],
    queryFn: () => fieldApi.clientsMap(),
  });
}
export function useCreateFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldClientInput) => fieldApi.createClient(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-clients'] });
      qc.invalidateQueries({ queryKey: ['field-clients-map'] });
      toast.success('Client created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create client')),
  });
}
export function useUpdateFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<FieldClientInput> }) =>
      fieldApi.updateClient(vars.id, vars.input),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['field-clients'] });
      qc.invalidateQueries({ queryKey: ['field-client', vars.id] });
      toast.success('Client updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update client')),
  });
}
export function useDeleteFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteClient(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-clients'] });
      toast.success('Client deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete client')),
  });
}

/* ── Visits ── */
export function useFieldVisits(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-visits', params],
    queryFn: () => fieldApi.listVisits(params),
  });
}
export function useTodayVisits() {
  return useQuery({
    queryKey: ['field-visits-today'],
    queryFn: () => fieldApi.todayVisits(),
  });
}
export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VisitInput) => fieldApi.createVisit(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-visits'] });
      qc.invalidateQueries({ queryKey: ['field-visits-today'] });
      toast.success('Visit created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create visit')),
  });
}
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientId: string; purpose?: VisitPurpose; checkIn: VisitCheckpoint }) =>
      fieldApi.checkIn(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-visits'] });
      qc.invalidateQueries({ queryKey: ['field-visits-today'] });
      toast.success('Checked in');
    },
    onError: (e) => toast.error(errMsg(e, 'Check-in failed')),
  });
}
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      input: { checkOut: VisitCheckpoint; notes?: string; outcome?: VisitOutcome };
    }) => fieldApi.checkOut(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-visits'] });
      qc.invalidateQueries({ queryKey: ['field-visits-today'] });
      toast.success('Checked out');
    },
    onError: (e) => toast.error(errMsg(e, 'Check-out failed')),
  });
}
export function useDeleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteVisit(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-visits'] });
      toast.success('Visit deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete')),
  });
}

/* ── Tasks ── */
export function useFieldTasks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-tasks', params],
    queryFn: () => fieldApi.listTasks(params),
  });
}
export function useCreateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldTaskInput) => fieldApi.createTask(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-tasks'] });
      toast.success('Task created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create task')),
  });
}
export function useUpdateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<FieldTaskInput> }) =>
      fieldApi.updateTask(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-tasks'] });
      toast.success('Task updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update task')),
  });
}
export function useDeleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-tasks'] });
      toast.success('Task deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete')),
  });
}
export function useCompleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      id: string;
      input: { completionPhotos?: string[]; completionNotes?: string };
    }) => fieldApi.completeTask(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-tasks'] });
      toast.success('Task completed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to complete')),
  });
}

/* ── Targets ── */
export function useSalesTargets(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-targets', params],
    queryFn: () => fieldApi.listTargets(params),
  });
}
export function useLeaderboard(params?: { month?: number; year?: number; type?: TargetType }) {
  return useQuery({
    queryKey: ['field-leaderboard', params],
    queryFn: () => fieldApi.leaderboard(params),
  });
}
export function useTeamSummary(params?: { month?: number; year?: number }) {
  return useQuery({
    queryKey: ['field-team-summary', params],
    queryFn: () => fieldApi.teamSummary(params),
  });
}
export function useCreateTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SalesTargetInput) => fieldApi.createTarget(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-targets'] });
      qc.invalidateQueries({ queryKey: ['field-leaderboard'] });
      toast.success('Target created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create target')),
  });
}
export function useUpdateTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<SalesTargetInput> }) =>
      fieldApi.updateTarget(vars.id, vars.input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-targets'] });
      toast.success('Target updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update target')),
  });
}
export function useDeleteTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteTarget(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-targets'] });
      toast.success('Target deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete')),
  });
}

/* ── Orders ── */
export function useFieldOrders(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-orders', params],
    queryFn: () => fieldApi.listOrders(params),
  });
}
export function useFieldOrder(id: string | undefined) {
  return useQuery({
    queryKey: ['field-order', id],
    queryFn: () => fieldApi.getOrder(id as string),
    enabled: !!id,
  });
}
export function useCreateFieldOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductOrderInput) => fieldApi.createOrder(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      toast.success('Order created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create order')),
  });
}
export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: OrderStatus }) =>
      fieldApi.updateOrderStatus(vars.id, vars.status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      toast.success('Status updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update status')),
  });
}
export function useDeleteFieldOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteOrder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-orders'] });
      toast.success('Order deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete')),
  });
}

/* ── Payments ── */
export function useFieldPayments(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-payments', params],
    queryFn: () => fieldApi.listPayments(params),
  });
}
export function usePaymentsDaily(date?: string) {
  return useQuery({
    queryKey: ['field-payments-daily', date],
    queryFn: () => fieldApi.paymentsDaily(date),
  });
}
export function useOutstandingReport() {
  return useQuery({
    queryKey: ['field-payments-outstanding'],
    queryFn: () => fieldApi.paymentsOutstanding(),
  });
}
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentCollectionInput) => fieldApi.createPayment(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-payments'] });
      qc.invalidateQueries({ queryKey: ['field-payments-daily'] });
      qc.invalidateQueries({ queryKey: ['field-payments-outstanding'] });
      toast.success('Payment recorded');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to record payment')),
  });
}
export function useVerifyPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.verifyPayment(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['field-payments'] });
      toast.success('Payment verified');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to verify')),
  });
}

/* ── Tracking ── */
export function useLiveTracking(refetchMs = 15000) {
  return useQuery({
    queryKey: ['field-live'],
    queryFn: () => fieldApi.liveTracking(),
    refetchInterval: refetchMs,
  });
}
export function useTrackingHistory(employeeId: string | undefined, date?: string) {
  return useQuery({
    queryKey: ['field-history', employeeId, date],
    queryFn: () => fieldApi.trackingHistory(employeeId as string, date),
    enabled: !!employeeId,
  });
}
