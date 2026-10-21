import { isAxiosError } from 'axios';
import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

/*
 * Field sales API (`/api/v1/field/*`). Every read is scoped by the server:
 * `field-sales.manage` sees every rep, a team lead (view + direct reports)
 * reads their reports' records, a rep only their own. Money is always
 * computed by the server — order requests carry product, quantity and
 * discount only.
 */

/* ──────────────────────────────────────────────────────────── */
/* Shared                                                        */
/* ──────────────────────────────────────────────────────────── */

/** An employee as the field lists populate it (`employeeId` is the employee code). */
export interface FieldEmployeeRef {
  _id: string;
  firstName: string;
  lastName: string;
  employeeId?: string;
  avatar?: string | null;
}

export interface ClientAddress {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number]; // [lng, lat]
}

export function refId(ref: string | { _id: string } | null | undefined): string {
  if (!ref) return '';
  return typeof ref === 'string' ? ref : ref._id;
}

export function personName(ref: string | FieldEmployeeRef | null | undefined): string {
  if (!ref || typeof ref === 'string') return '—';
  return `${ref.firstName} ${ref.lastName}`.trim();
}

/* ──────────────────────────────────────────────────────────── */
/* Clients                                                       */
/* ──────────────────────────────────────────────────────────── */

export type ClientCategory = 'A' | 'B' | 'C';
export type ClientStatus = 'active' | 'inactive';

export interface ClientNote {
  text: string;
  by?: string;
  at: string;
}

export interface FieldClient {
  _id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  company?: string;
  category: ClientCategory;
  tags: string[];
  address?: ClientAddress;
  location?: GeoPoint;
  assignedTo?: string | FieldEmployeeRef;
  territory?: string;
  lastVisitDate?: string;
  totalOrders: number;
  totalOrderValue?: number;
  totalPayments: number;
  outstandingAmount: number;
  notes: ClientNote[];
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FieldClientInput {
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  company?: string;
  category?: ClientCategory;
  tags?: string[];
  address?: ClientAddress;
  location?: { lat: number; lng: number };
  assignedTo?: string;
  territory?: string;
  status?: ClientStatus;
}

/** `null` clears an optional field on an update (the server `$unset`s it). */
type Clearable<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };

/** A client edit: cleared contact details, pin, rep or territory go as `null`. */
export type FieldClientUpdate = Clearable<
  Partial<FieldClientInput>,
  'contactPerson' | 'phone' | 'email' | 'company' | 'location' | 'assignedTo' | 'territory'
>;

/** One client pin on the client map. */
export interface ClientPin {
  _id: string;
  name: string;
  category: ClientCategory;
  status: ClientStatus;
  lat: number;
  lng: number;
  address?: ClientAddress;
  assignedTo?: FieldEmployeeRef | null;
  lastVisitDate?: string | null;
}

/* ──────────────────────────────────────────────────────────── */
/* Products                                                      */
/* ──────────────────────────────────────────────────────────── */

export const GST_RATES = [0, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
  gstRate: number;
  hsnCode?: string;
  description?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductInput {
  name: string;
  sku: string;
  category: string;
  unit?: string;
  price: number;
  gstRate: number;
  hsnCode?: string;
  description?: string;
  isActive?: boolean;
}

/** A product edit: a cleared HSN code or description goes as `null`. */
export type ProductUpdate = Clearable<Partial<ProductInput>, 'hsnCode' | 'description'>;

/* ──────────────────────────────────────────────────────────── */
/* Visits                                                        */
/* ──────────────────────────────────────────────────────────── */

export type VisitPurpose = 'sales' | 'service' | 'collection' | 'followup' | 'delivery' | 'other';
export type VisitOutcome = 'positive' | 'negative' | 'neutral' | 'followup_required';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface VisitCheckpoint {
  time?: string;
  location?: { lat: number; lng: number; accuracy?: number };
  /** Signed URL (short-lived) on reads; the upload's `url` on writes. */
  photo?: string;
  address?: string;
  /** Check-out only: the rep's notes when closing the visit (the visit's `notes` are the check-in ones). */
  notes?: string;
}

export interface FieldVisit {
  _id: string;
  employeeId: string | FieldEmployeeRef;
  clientId:
    | string
    | {
        _id: string;
        name: string;
        category?: string;
        company?: string;
        address?: ClientAddress;
        location?: GeoPoint;
      };
  purpose: VisitPurpose;
  checkIn?: VisitCheckpoint;
  checkOut?: VisitCheckpoint;
  /** Metres between the check-in fix and the client's pin (absent without both). */
  distanceFromClientM?: number;
  /** True when the check-in was farther from the client than the allowed radius. */
  locationMismatch?: boolean;
  /** True when the rep checked in without a GPS fix at a client that has a pin. */
  locationMissing?: boolean;
  duration?: number;
  /** Notes given at check-in (or when the visit was planned); check-out notes are `checkOut.notes`. */
  notes?: string;
  outcome?: VisitOutcome;
  nextFollowUpDate?: string;
  photos: string[];
  meetingWith?: string;
  productsDiscussed: string[];
  orderPlaced?: string;
  paymentCollected?: string;
  isPlanned: boolean;
  status: VisitStatus;
  createdAt: string;
  updatedAt: string;
}

export interface VisitInput {
  clientId: string;
  employeeId?: string;
  purpose?: VisitPurpose;
  isPlanned?: boolean;
  notes?: string;
  meetingWith?: string;
}

export interface CheckInInput {
  clientId: string;
  visitId?: string;
  purpose?: VisitPurpose;
  notes?: string;
  checkIn: Omit<VisitCheckpoint, 'time'>;
}

export interface CheckOutInput {
  checkOut: Omit<VisitCheckpoint, 'time'>;
  notes?: string;
  outcome?: VisitOutcome;
  nextFollowUpDate?: string;
}

/** A visit pin — on the visits map and the trail. */
export interface VisitPin {
  visitId: string;
  employeeId: string;
  employeeName?: string;
  clientId: string;
  clientName: string;
  lat: number | null;
  lng: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  status: VisitStatus;
  purpose: VisitPurpose;
}

/* ──────────────────────────────────────────────────────────── */
/* Tasks                                                         */
/* ──────────────────────────────────────────────────────────── */

export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FieldTaskStatus = 'new' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface FieldTask {
  _id: string;
  title: string;
  description?: string;
  assignedTo: string | FieldEmployeeRef;
  clientId?: string | { _id: string; name: string; address?: ClientAddress };
  location?: { lat?: number; lng?: number; address?: string };
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  dueDate?: string;
  completedAt?: string;
  completionPhotos: string[];
  completionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldTaskInput {
  title: string;
  description?: string;
  assignedTo: string;
  clientId?: string;
  priority?: FieldTaskPriority;
  status?: FieldTaskStatus;
  dueDate?: string;
}

/** A task edit: a cleared description, client or due date goes as `null`. */
export type FieldTaskUpdate = Clearable<Partial<FieldTaskInput>, 'description' | 'clientId' | 'dueDate'>;

/* ──────────────────────────────────────────────────────────── */
/* Targets                                                       */
/* ──────────────────────────────────────────────────────────── */

export type TargetType = 'amount' | 'quantity' | 'visits';
export type TargetStatus = 'on_track' | 'behind' | 'exceeded';

export interface TargetMilestone {
  value: number;
  reward?: string;
  achieved?: boolean;
}

export interface SalesTarget {
  _id: string;
  employeeId: string | FieldEmployeeRef;
  period: { month: number; year: number };
  type: TargetType;
  productCategory?: string;
  targetValue: number;
  /** Computed by the server on every read. */
  achievedValue: number;
  percentage: number;
  status: TargetStatus;
  milestones: TargetMilestone[];
  createdAt: string;
}

export interface SalesTargetInput {
  employeeId: string;
  period: { month: number; year: number };
  type: TargetType;
  productCategory?: string;
  targetValue: number;
  milestones?: Array<{ value: number; reward?: string }>;
}

/** A target edit: a cleared product category (every product counts) goes as `null`. */
export type SalesTargetUpdate = Clearable<Partial<Omit<SalesTargetInput, 'employeeId'>>, 'productCategory'>;

export interface TeamSummary {
  month: number;
  year: number;
  type: TargetType;
  totalTarget: number;
  totalAchieved: number;
  percentage: number;
  employees: number;
  details: SalesTarget[];
}

/* ──────────────────────────────────────────────────────────── */
/* Orders                                                        */
/* ──────────────────────────────────────────────────────────── */

/** `draft`, `processing`, `shipped` appear only on orders booked before the catalogue. */
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'delivered'
  | 'cancelled'
  | 'draft'
  | 'processing'
  | 'shipped';
export type OrderPaymentStatus = 'pending' | 'partial' | 'paid';

/** A catalogue-priced line (older orders have free-text lines with fewer fields). */
export interface OrderLine {
  productId?: string;
  name: string;
  sku?: string;
  unit?: string;
  category?: string;
  hsnCode?: string;
  quantity: number;
  unitPrice: number;
  discountPercent?: number;
  gstRate?: number;
  lineSubtotal?: number;
  lineGst?: number;
  lineTotal?: number;
  discount?: number;
  total?: number;
}

export interface ProductOrder {
  _id: string;
  orderNumber: string;
  employeeId: string | FieldEmployeeRef;
  clientId: string | { _id: string; name: string; company?: string; phone?: string; address?: ClientAddress };
  items: OrderLine[];
  subtotal: number;
  discountTotal?: number;
  taxAmount: number;
  gstTotal?: number;
  totalAmount: number;
  total?: number;
  status: OrderStatus;
  deliveryDate?: string;
  notes?: string;
  visitId?: string;
  paymentStatus: OrderPaymentStatus;
  paidAmount: number;
  confirmedAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  createdAt: string;
}

/** What an order line sends: the server prices it from the catalogue. */
export interface OrderLineInput {
  productId: string;
  quantity: number;
  discountPercent: number;
}

export interface ProductOrderInput {
  clientId: string;
  items: OrderLineInput[];
  notes?: string;
  deliveryDate?: string;
  visitId?: string;
  employeeId?: string;
}

export type OrderStatusChange = 'confirmed' | 'delivered' | 'cancelled';

export interface OrderReport {
  from: string;
  to: string;
  byStatus: Array<{ _id: OrderStatus; count: number; total: number }>;
  totals: { count: number; total: number; paid: number };
}

/* ──────────────────────────────────────────────────────────── */
/* Payments                                                      */
/* ──────────────────────────────────────────────────────────── */

export type FieldPaymentMethod = 'cash' | 'cheque' | 'upi' | 'bank_transfer' | 'other';
export type PaymentCollectionStatus = 'collected' | 'deposited' | 'verified' | 'bounced';

export interface PaymentCollection {
  _id: string;
  receiptNumber: string;
  employeeId: string | FieldEmployeeRef;
  clientId: string | { _id: string; name: string; company?: string; phone?: string };
  amount: number;
  method: FieldPaymentMethod;
  reference?: string;
  collectedAt: string;
  orderId?: string | { _id: string; orderNumber: string; totalAmount: number; status?: OrderStatus };
  visitId?: string;
  notes?: string;
  status: PaymentCollectionStatus;
  depositedAt?: string;
  createdAt: string;
}

export interface PaymentCollectionInput {
  clientId: string;
  amount: number;
  method: FieldPaymentMethod;
  reference?: string;
  collectedAt?: string;
  visitId?: string;
  orderId?: string;
  notes?: string;
  employeeId?: string;
}

export interface DailyPaymentReport {
  date: string;
  byMethod: Array<{ _id: FieldPaymentMethod; count: number; total: number }>;
  totals: { count: number; total: number };
}

export interface OutstandingClient {
  _id: string;
  name: string;
  company?: string;
  outstandingAmount: number;
  totalPayments: number;
  totalOrders: number;
  totalOrderValue?: number;
}

export interface OutstandingReport {
  total: number;
  clients: OutstandingClient[];
}

/* ──────────────────────────────────────────────────────────── */
/* Tracking                                                      */
/* ──────────────────────────────────────────────────────────── */

/** A rep's newest point in the last 2 h (`GET /field/tracking/live`). */
export interface LiveLocation {
  employeeId: string;
  employeeCode?: string;
  name: string;
  avatar?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery?: number | null;
  recordedAt: string;
  onVisit?: { visitId: string; clientId: string; clientName: string } | null;
}

/** The socket's `location:update` payload. */
export interface LocationUpdate {
  employeeId: string;
  name: string;
  avatar?: string | null;
  lat: number;
  lng: number;
  accuracy?: number | null;
  recordedAt: string;
}

export interface TrailPoint {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  recordedAt: string;
}

export interface Trail {
  employeeId: string;
  name: string;
  avatar?: string | null;
  /** IST day, `YYYY-MM-DD`. */
  date: string;
  points: TrailPoint[];
  truncated: boolean;
  visits: VisitPin[];
}

export interface FieldDashboard {
  date?: string;
  visitsToday: number;
  tasksCompleted: number;
  orders: { count: number; total: number };
  payments: { count: number; total: number };
  recentActivity: FieldVisit[];
}

/* ──────────────────────────────────────────────────────────── */
/* Helpers                                                       */
/* ──────────────────────────────────────────────────────────── */

/** A fresh `Idempotency-Key` (8–64 of `[A-Za-z0-9_-]`) for one money write. */
export function newIdempotencyKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** A Blob error body (receipt PDF request) → the server's message. */
async function readableBlobError(err: unknown): Promise<never> {
  if (!isAxiosError(err) || !(err.response?.data instanceof Blob)) throw err;
  let message = err.response.statusText || err.message;
  try {
    const parsed = JSON.parse(await err.response.data.text()) as { error?: { message?: unknown } };
    if (typeof parsed.error?.message === 'string' && parsed.error.message) message = parsed.error.message;
  } catch {
    // not the JSON envelope
  }
  throw new Error(message, { cause: err });
}

type Ok<T> = { success: boolean; data: T };

/* ──────────────────────────────────────────────────────────── */
/* API                                                           */
/* ──────────────────────────────────────────────────────────── */

export const fieldApi = {
  // dashboard
  dashboard: async (): Promise<ItemResponse<FieldDashboard>> =>
    (await api.get('/field/dashboard')).data,

  // photo upload — returns a signed URL to attach within its TTL
  uploadPhoto: async (file: File): Promise<Ok<{ url: string; key: string }>> => {
    const fd = new FormData();
    fd.append('photo', file);
    return (
      await api.post('/field/uploads/photo', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    ).data;
  },

  // products
  listProducts: async (params?: Record<string, unknown>): Promise<ListResponse<Product>> =>
    (await api.get('/field/products', { params })).data,
  productCategories: async (): Promise<Ok<string[]>> =>
    (await api.get('/field/products/categories')).data,
  createProduct: async (input: ProductInput): Promise<ItemResponse<Product>> =>
    (await api.post('/field/products', input)).data,
  updateProduct: async (id: string, input: ProductUpdate): Promise<ItemResponse<Product>> =>
    (await api.patch(`/field/products/${id}`, input)).data,
  deleteProduct: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/products/${id}`)).data,

  // clients
  listClients: async (params?: Record<string, unknown>): Promise<ListResponse<FieldClient>> =>
    (await api.get('/field/clients', { params })).data,
  /** `bbox` = Leaflet's `toBBoxString()` (`minLng,minLat,maxLng,maxLat`); ≤ 500 pins. */
  clientsMap: async (bbox?: string): Promise<Ok<ClientPin[]> & { truncated: boolean }> =>
    (await api.get('/field/clients/map', { params: bbox ? { bbox } : undefined })).data,
  getClient: async (id: string): Promise<ItemResponse<FieldClient>> =>
    (await api.get(`/field/clients/${id}`)).data,
  createClient: async (input: FieldClientInput): Promise<ItemResponse<FieldClient>> =>
    (await api.post('/field/clients', input)).data,
  updateClient: async (id: string, input: FieldClientUpdate): Promise<ItemResponse<FieldClient>> =>
    (await api.patch(`/field/clients/${id}`, input)).data,
  deleteClient: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/clients/${id}`)).data,
  addClientNote: async (id: string, text: string): Promise<ItemResponse<FieldClient>> =>
    (await api.post(`/field/clients/${id}/notes`, { text })).data,

  // visits
  listVisits: async (params?: Record<string, unknown>): Promise<ListResponse<FieldVisit>> =>
    (await api.get('/field/visits', { params })).data,
  todayVisits: async (): Promise<Ok<FieldVisit[]>> => (await api.get('/field/visits/today')).data,
  visitsMap: async (params: { date?: string; employeeId?: string }): Promise<
    Ok<VisitPin[]> & { date: string; truncated: boolean }
  > => (await api.get('/field/visits/map', { params })).data,
  getVisit: async (id: string): Promise<ItemResponse<FieldVisit>> =>
    (await api.get(`/field/visits/${id}`)).data,
  createVisit: async (input: VisitInput): Promise<ItemResponse<FieldVisit>> =>
    (await api.post('/field/visits', input)).data,
  updateVisit: async (
    id: string,
    input: Partial<Pick<FieldVisit, 'purpose' | 'notes' | 'outcome' | 'status' | 'photos' | 'meetingWith'>>,
  ): Promise<ItemResponse<FieldVisit>> => (await api.patch(`/field/visits/${id}`, input)).data,
  deleteVisit: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/visits/${id}`)).data,
  checkIn: async (input: CheckInInput): Promise<ItemResponse<FieldVisit>> =>
    (await api.post('/field/visits/check-in', input)).data,
  checkOut: async (id: string, input: CheckOutInput): Promise<ItemResponse<FieldVisit>> =>
    (await api.post(`/field/visits/${id}/check-out`, input)).data,

  // tasks
  listTasks: async (params?: Record<string, unknown>): Promise<ListResponse<FieldTask>> =>
    (await api.get('/field/tasks', { params })).data,
  createTask: async (input: FieldTaskInput): Promise<ItemResponse<FieldTask>> =>
    (await api.post('/field/tasks', input)).data,
  updateTask: async (id: string, input: FieldTaskUpdate): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}`, input)).data,
  deleteTask: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/tasks/${id}`)).data,
  acceptTask: async (id: string): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}/accept`)).data,
  completeTask: async (
    id: string,
    input: { completionPhotos?: string[]; completionNotes?: string },
  ): Promise<ItemResponse<FieldTask>> => (await api.patch(`/field/tasks/${id}/complete`, input)).data,

  // targets
  listTargets: async (params?: Record<string, unknown>): Promise<ListResponse<SalesTarget>> =>
    (await api.get('/field/targets', { params })).data,
  leaderboard: async (params?: { month?: number; year?: number; type?: TargetType }): Promise<Ok<SalesTarget[]>> =>
    (await api.get('/field/targets/leaderboard', { params })).data,
  teamSummary: async (params?: { month?: number; year?: number; type?: TargetType }): Promise<Ok<TeamSummary>> =>
    (await api.get('/field/targets/team-summary', { params })).data,
  createTarget: async (input: SalesTargetInput): Promise<ItemResponse<SalesTarget>> =>
    (await api.post('/field/targets', input)).data,
  updateTarget: async (id: string, input: SalesTargetUpdate): Promise<ItemResponse<SalesTarget>> =>
    (await api.patch(`/field/targets/${id}`, input)).data,
  deleteTarget: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/targets/${id}`)).data,

  // orders
  listOrders: async (params?: Record<string, unknown>): Promise<ListResponse<ProductOrder>> =>
    (await api.get('/field/orders', { params })).data,
  orderReports: async (params?: { from?: string; to?: string; employeeId?: string }): Promise<Ok<OrderReport>> =>
    (await api.get('/field/orders/reports', { params })).data,
  getOrder: async (id: string): Promise<ItemResponse<ProductOrder>> =>
    (await api.get(`/field/orders/${id}`)).data,
  /** `idempotencyKey` makes a double submit (or a retry) book one order, not two. */
  createOrder: async (input: ProductOrderInput, idempotencyKey: string): Promise<ItemResponse<ProductOrder>> =>
    (await api.post('/field/orders', input, { headers: { 'Idempotency-Key': idempotencyKey } })).data,
  updateOrder: async (
    id: string,
    input: { items?: OrderLineInput[]; notes?: string; deliveryDate?: string },
  ): Promise<ItemResponse<ProductOrder>> => (await api.patch(`/field/orders/${id}`, input)).data,
  deleteOrder: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/orders/${id}`)).data,
  updateOrderStatus: async (id: string, status: OrderStatusChange): Promise<ItemResponse<ProductOrder>> =>
    (await api.patch(`/field/orders/${id}/status`, { status })).data,

  // payments
  listPayments: async (params?: Record<string, unknown>): Promise<ListResponse<PaymentCollection>> =>
    (await api.get('/field/payments', { params })).data,
  paymentsDaily: async (date?: string): Promise<Ok<DailyPaymentReport>> =>
    (await api.get('/field/payments/reports/daily', { params: date ? { date } : undefined })).data,
  paymentsOutstanding: async (params?: { page?: number; limit?: number; search?: string }): Promise<
    Ok<OutstandingReport> & { pagination?: { page: number; limit: number; total: number; pages: number } }
  > => (await api.get('/field/payments/reports/outstanding', { params })).data,
  createPayment: async (
    input: PaymentCollectionInput,
    idempotencyKey: string,
  ): Promise<ItemResponse<PaymentCollection>> =>
    (await api.post('/field/payments', input, { headers: { 'Idempotency-Key': idempotencyKey } })).data,
  depositPayment: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.patch(`/field/payments/${id}/deposit`)).data,
  verifyPayment: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.patch(`/field/payments/${id}/verify`)).data,
  markPaymentBounced: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.patch(`/field/payments/${id}`, { status: 'bounced' })).data,
  /** "Take back bounce": `bounced → collected` (400/409 when the order has no room left for it). */
  takeBackBounce: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.patch(`/field/payments/${id}`, { status: 'collected' })).data,
  deletePayment: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/payments/${id}`)).data,
  /** The receipt PDF, fetched with the caller's credentials. */
  receipt: async (id: string): Promise<Blob> =>
    (
      await api
        .get<Blob>(`/field/payments/${id}/receipt`, { responseType: 'blob' })
        .catch(readableBlobError)
    ).data,

  // tracking
  liveTracking: async (): Promise<Ok<LiveLocation[]>> => (await api.get('/field/tracking/live')).data,
  /** One rep's points and visits on an IST day (`YYYY-MM-DD`; default today). */
  trail: async (employeeId: string, date?: string): Promise<Ok<Trail>> =>
    (await api.get(`/field/tracking/${employeeId}/trail`, { params: date ? { date } : undefined })).data,
};
