import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  fieldApi,
  type CheckInInput,
  type CheckOutInput,
  type FieldClientInput,
  type FieldClientUpdate,
  type FieldTaskInput,
  type FieldTaskUpdate,
  type OrderLineInput,
  type OrderStatusChange,
  type PaymentCollectionInput,
  type ProductInput,
  type ProductOrderInput,
  type ProductUpdate,
  type SalesTargetInput,
  type SalesTargetUpdate,
  type TargetType,
  type VisitInput,
} from '@/lib/field.api';
import { usePermissions } from '@/hooks/use-permissions';
import { useActiveEmployees } from '@/hooks/use-employee-picker';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';

/*
 * Mutation failures are toasted once, by the global handler
 * (`lib/query-client.ts`) — never again here.
 */

/** `useIsMutating` keys of the money writes, so their dialogs can refuse to close mid-request. */
export const CREATE_ORDER_MUTATION_KEY = ['field-order-create'] as const;
export const CREATE_PAYMENT_MUTATION_KEY = ['field-payment-create'] as const;

/** `field-sales.manage` — sees and acts on every rep's records. */
export function useCanManageField(): boolean {
  const { has } = usePermissions();
  return has('field-sales.manage');
}

/* ── Dashboard ── */
export function useFieldDashboard() {
  return useQuery({ queryKey: ['field-dashboard'], queryFn: () => fieldApi.dashboard() });
}

/* ── Reps (pickers) ── */

/**
 * Employees a field manager can assign work or targets to: the shared
 * current-staff picker (≤ 100 per request, active + on notice).
 */
export function useFieldReps(enabled = true) {
  return useActiveEmployees({ enabled });
}

/**
 * True when a create form cannot be sent without naming a rep: a field
 * manager with no employee record of their own (e.g. the seeded admin).
 */
export function useRepSelectRequired(): boolean {
  const canManage = useCanManageField();
  const { noProfile } = useMyEmployeeProfile({ enabled: canManage });
  return canManage && noProfile;
}

/** The signed-in user's own employee id, if they have an employee record. */
export function useMyEmployeeId(): string | undefined {
  return useMyEmployeeProfile().profile?._id;
}

/* ── Products ── */
export function useProducts(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-products', params],
    queryFn: () => fieldApi.listProducts(params),
    placeholderData: keepPreviousData,
  });
}
export function useProductCategories() {
  return useQuery({
    queryKey: ['field-product-categories'],
    queryFn: () => fieldApi.productCategories(),
    staleTime: 60_000,
  });
}
function invalidateProducts(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-products'] });
  qc.invalidateQueries({ queryKey: ['field-product-categories'] });
}
export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductInput) => fieldApi.createProduct(input),
    onSuccess: () => {
      invalidateProducts(qc);
      toast.success('Product added');
    },
  });
}
export function useUpdateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: ProductUpdate }) => fieldApi.updateProduct(vars.id, vars.input),
    onSuccess: () => {
      invalidateProducts(qc);
      toast.success('Product updated');
    },
  });
}
export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteProduct(id),
    onSuccess: () => {
      invalidateProducts(qc);
      toast.success('Product removed');
    },
  });
}

/* ── Clients ── */
export function useFieldClients(params?: Record<string, unknown>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field-clients', params],
    queryFn: () => fieldApi.listClients(params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}
export function useClientsMap(bbox: string | null) {
  return useQuery({
    queryKey: ['field-clients-map', bbox],
    queryFn: () => fieldApi.clientsMap(bbox ?? undefined),
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
  });
}
function invalidateClients(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-clients'] });
  qc.invalidateQueries({ queryKey: ['field-clients-map'] });
}
export function useCreateFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldClientInput) => fieldApi.createClient(input),
    onSuccess: () => {
      invalidateClients(qc);
      toast.success('Client created');
    },
  });
}
export function useUpdateFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: FieldClientUpdate }) => fieldApi.updateClient(vars.id, vars.input),
    onSuccess: () => {
      invalidateClients(qc);
      toast.success('Client updated');
    },
  });
}
export function useDeleteFieldClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteClient(id),
    onSuccess: () => {
      invalidateClients(qc);
      toast.success('Client deleted');
    },
  });
}

/* ── Visits ── */
function invalidateVisits(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-visits'] });
  qc.invalidateQueries({ queryKey: ['field-visits-today'] });
  qc.invalidateQueries({ queryKey: ['field-visits-map'] });
  qc.invalidateQueries({ queryKey: ['field-dashboard'] });
}
export function useFieldVisits(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-visits', params],
    queryFn: () => fieldApi.listVisits(params),
    placeholderData: keepPreviousData,
  });
}
export function useTodayVisits() {
  return useQuery({ queryKey: ['field-visits-today'], queryFn: () => fieldApi.todayVisits() });
}
export function useVisitsMap(params: { date?: string; employeeId?: string }, enabled = true) {
  return useQuery({
    queryKey: ['field-visits-map', params],
    queryFn: () => fieldApi.visitsMap(params),
    enabled,
  });
}
export function useCreateVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: VisitInput) => fieldApi.createVisit(input),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Visit planned');
    },
  });
}
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CheckInInput) => fieldApi.checkIn(input),
    onSuccess: (res) => {
      invalidateVisits(qc);
      if (res.data.locationMissing) {
        toast.warning('Checked in without a location — the visit is flagged for your manager');
      } else if (res.data.locationMismatch) {
        const d = res.data.distanceFromClientM;
        toast.warning(
          d != null
            ? `Checked in — ${(d / 1000).toFixed(1)} km from the client's pin`
            : "Checked in — away from the client's pin",
        );
      } else {
        toast.success('Checked in');
      }
    },
  });
}
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: CheckOutInput }) => fieldApi.checkOut(vars.id, vars.input),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Checked out');
    },
  });
}
export function useCancelVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.updateVisit(id, { status: 'cancelled' }),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Visit cancelled');
    },
  });
}
export function useDeleteVisit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteVisit(id),
    onSuccess: () => {
      invalidateVisits(qc);
      toast.success('Visit deleted');
    },
  });
}
export function useUploadFieldPhoto() {
  return useMutation({
    mutationFn: (file: File) => fieldApi.uploadPhoto(file),
  });
}

/* ── Tasks ── */
function invalidateTasks(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-tasks'] });
  qc.invalidateQueries({ queryKey: ['field-dashboard'] });
}
export function useFieldTasks(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-tasks', params],
    queryFn: () => fieldApi.listTasks(params),
    placeholderData: keepPreviousData,
  });
}
export function useCreateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FieldTaskInput) => fieldApi.createTask(input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task assigned');
    },
  });
}
export function useUpdateFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: FieldTaskUpdate }) => fieldApi.updateTask(vars.id, vars.input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task updated');
    },
  });
}
export function useDeleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteTask(id),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task deleted');
    },
  });
}
export function useAcceptFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.acceptTask(id),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task accepted');
    },
  });
}
export function useCompleteFieldTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: { completionPhotos?: string[]; completionNotes?: string } }) =>
      fieldApi.completeTask(vars.id, vars.input),
    onSuccess: () => {
      invalidateTasks(qc);
      toast.success('Task completed');
    },
  });
}

/* ── Targets ── */
function invalidateTargets(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-targets'] });
  qc.invalidateQueries({ queryKey: ['field-leaderboard'] });
  qc.invalidateQueries({ queryKey: ['field-team-summary'] });
}
export function useSalesTargets(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-targets', params],
    queryFn: () => fieldApi.listTargets(params),
    placeholderData: keepPreviousData,
  });
}
export function useLeaderboard(params?: { month?: number; year?: number; type?: TargetType }) {
  return useQuery({ queryKey: ['field-leaderboard', params], queryFn: () => fieldApi.leaderboard(params) });
}
export function useTeamSummary(params?: { month?: number; year?: number; type?: TargetType }) {
  return useQuery({ queryKey: ['field-team-summary', params], queryFn: () => fieldApi.teamSummary(params) });
}
export function useCreateTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SalesTargetInput) => fieldApi.createTarget(input),
    onSuccess: () => {
      invalidateTargets(qc);
      toast.success('Target set');
    },
  });
}
export function useUpdateTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: SalesTargetUpdate }) => fieldApi.updateTarget(vars.id, vars.input),
    onSuccess: () => {
      invalidateTargets(qc);
      toast.success('Target updated');
    },
  });
}
export function useDeleteTarget() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteTarget(id),
    onSuccess: () => {
      invalidateTargets(qc);
      toast.success('Target deleted');
    },
  });
}

/* ── Orders ── */
function invalidateOrders(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-orders'] });
  qc.invalidateQueries({ queryKey: ['field-order'] });
  qc.invalidateQueries({ queryKey: ['field-order-report'] });
  qc.invalidateQueries({ queryKey: ['field-clients'] });
  qc.invalidateQueries({ queryKey: ['field-payments-outstanding'] });
  qc.invalidateQueries({ queryKey: ['field-dashboard'] });
  qc.invalidateQueries({ queryKey: ['field-targets'] });
}
export function useFieldOrders(params?: Record<string, unknown>, opts: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['field-orders', params],
    queryFn: () => fieldApi.listOrders(params),
    placeholderData: keepPreviousData,
    enabled: opts.enabled ?? true,
  });
}
export function useFieldOrder(id: string | undefined | null) {
  return useQuery({
    queryKey: ['field-order', id],
    queryFn: () => fieldApi.getOrder(id as string),
    enabled: !!id,
  });
}
export function useOrderReport(params?: { from?: string; to?: string }) {
  return useQuery({ queryKey: ['field-order-report', params], queryFn: () => fieldApi.orderReports(params) });
}
export function useCreateFieldOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CREATE_ORDER_MUTATION_KEY,
    mutationFn: (vars: { input: ProductOrderInput; idempotencyKey: string }) =>
      fieldApi.createOrder(vars.input, vars.idempotencyKey),
    onSuccess: (res) => {
      invalidateOrders(qc);
      toast.success(`Order ${res.data.orderNumber} placed`);
    },
  });
}
export function useUpdateFieldOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: { items?: OrderLineInput[]; notes?: string; deliveryDate?: string } }) =>
      fieldApi.updateOrder(vars.id, vars.input),
    onSuccess: () => {
      invalidateOrders(qc);
      toast.success('Order updated');
    },
  });
}
const STATUS_DONE: Record<OrderStatusChange, string> = {
  confirmed: 'Order confirmed',
  delivered: 'Order marked delivered',
  cancelled: 'Order cancelled',
};
export function useUpdateOrderStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; status: OrderStatusChange }) => fieldApi.updateOrderStatus(vars.id, vars.status),
    onSuccess: (_d, vars) => {
      invalidateOrders(qc);
      toast.success(STATUS_DONE[vars.status]);
    },
  });
}
export function useDeleteFieldOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => fieldApi.deleteOrder(id),
    onSuccess: () => {
      invalidateOrders(qc);
      toast.success('Order deleted');
    },
  });
}

/* ── Payments ── */
function invalidatePayments(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['field-payments'] });
  qc.invalidateQueries({ queryKey: ['field-payments-daily'] });
  qc.invalidateQueries({ queryKey: ['field-payments-outstanding'] });
  qc.invalidateQueries({ queryKey: ['field-orders'] });
  qc.invalidateQueries({ queryKey: ['field-order'] });
  qc.invalidateQueries({ queryKey: ['field-clients'] });
  qc.invalidateQueries({ queryKey: ['field-dashboard'] });
}
export function useFieldPayments(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['field-payments', params],
    queryFn: () => fieldApi.listPayments(params),
    placeholderData: keepPreviousData,
  });
}
export function usePaymentsDaily(date?: string) {
  return useQuery({ queryKey: ['field-payments-daily', date], queryFn: () => fieldApi.paymentsDaily(date) });
}
export function useOutstandingReport(params?: { page?: number; limit?: number; search?: string }) {
  return useQuery({
    queryKey: ['field-payments-outstanding', params],
    queryFn: () => fieldApi.paymentsOutstanding(params),
  });
}
export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: CREATE_PAYMENT_MUTATION_KEY,
    mutationFn: (vars: { input: PaymentCollectionInput; idempotencyKey: string }) =>
      fieldApi.createPayment(vars.input, vars.idempotencyKey),
    onSuccess: (res) => {
      invalidatePayments(qc);
      toast.success(`Payment recorded — receipt ${res.data.receiptNumber}`);
    },
  });
}
/**
 * One status step or delete on a payment. A refusal (409
 * `INVALID_STATUS_TRANSITION` — someone moved it meanwhile; 400 `OVERPAYMENT`
 * — the order has no room to take a bounce back) is toasted by the global
 * handler with the server's message, and the list is re-read so the row
 * stops offering a dead action.
 */
function paymentAction(fn: (id: string) => Promise<unknown>, done: string) {
  return function usePaymentAction() {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: fn,
      onSuccess: () => {
        invalidatePayments(qc);
        toast.success(done);
      },
      onError: () => invalidatePayments(qc),
    });
  };
}
export const useVerifyPayment = paymentAction((id) => fieldApi.verifyPayment(id), 'Payment verified');
export const useDepositPayment = paymentAction((id) => fieldApi.depositPayment(id), 'Marked as deposited');
export const useBouncePayment = paymentAction((id) => fieldApi.markPaymentBounced(id), 'Marked as bounced');
export const useUnbouncePayment = paymentAction((id) => fieldApi.takeBackBounce(id), 'Bounce taken back — the payment counts again');
export const useDeletePayment = paymentAction((id) => fieldApi.deletePayment(id), 'Payment deleted');

/* ── Tracking ── */
export function useTrail(employeeId: string | undefined, date: string) {
  return useQuery({
    queryKey: ['field-trail', employeeId, date],
    queryFn: () => fieldApi.trail(employeeId as string, date),
    enabled: !!employeeId,
  });
}
