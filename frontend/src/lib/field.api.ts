import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

/* ──────────────────────────────────────────────────────────── */
/* Types                                                         */
/* ──────────────────────────────────────────────────────────── */

export type ClientCategory = 'A' | 'B' | 'C';
export type ClientStatus = 'active' | 'inactive';

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
  assignedTo?:
    | string
    | { _id: string; firstName: string; lastName: string; avatar?: string };
  territory?: string;
  lastVisitDate?: string;
  totalOrders: number;
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

export type VisitPurpose = 'sales' | 'service' | 'collection' | 'followup' | 'other';
export type VisitOutcome = 'positive' | 'negative' | 'neutral' | 'followup_required';
export type VisitStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled';

export interface VisitCheckpoint {
  time?: string;
  location?: { lat: number; lng: number; accuracy?: number };
  photo?: string;
  address?: string;
}

export interface FieldVisit {
  _id: string;
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeCode?: string };
  clientId: string | { _id: string; name: string; category?: string; company?: string };
  purpose: VisitPurpose;
  checkIn?: VisitCheckpoint;
  checkOut?: VisitCheckpoint;
  duration?: number;
  notes?: string;
  outcome?: VisitOutcome;
  nextFollowUpDate?: string;
  photos: string[];
  meetingWith?: string;
  productsDiscussed: string[];
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
  status?: VisitStatus;
}

export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FieldTaskStatus =
  | 'new'
  | 'accepted'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export interface FieldTask {
  _id: string;
  title: string;
  description?: string;
  assignedTo: string | { _id: string; firstName: string; lastName: string };
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

export type TargetType = 'amount' | 'quantity' | 'visits';
export type TargetStatus = 'on_track' | 'behind' | 'exceeded';

export interface TargetMilestone {
  value: number;
  reward?: string;
  achieved: boolean;
}

export interface SalesTarget {
  _id: string;
  employeeId:
    | string
    | { _id: string; firstName: string; lastName: string; employeeCode?: string; avatar?: string };
  period: { month: number; year: number };
  type: TargetType;
  productCategory?: string;
  targetValue: number;
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
  milestones?: TargetMilestone[];
}

export type OrderStatus =
  | 'draft'
  | 'confirmed'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled';
export type OrderPaymentStatus = 'pending' | 'partial' | 'paid';

export interface OrderItem {
  productId?: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface ProductOrder {
  _id: string;
  orderNumber: string;
  employeeId: string | { _id: string; firstName: string; lastName: string };
  clientId: string | { _id: string; name: string; company?: string };
  items: OrderItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: OrderStatus;
  deliveryDate?: string;
  notes?: string;
  paymentStatus: OrderPaymentStatus;
  paidAmount: number;
  createdAt: string;
}

export interface ProductOrderInput {
  clientId: string;
  employeeId?: string;
  items: OrderItem[];
  taxAmount?: number;
  status?: OrderStatus;
  deliveryDate?: string;
  notes?: string;
}

export type FieldPaymentMethod = 'cash' | 'cheque' | 'upi' | 'bank_transfer' | 'other';
export type PaymentCollectionStatus = 'collected' | 'deposited' | 'verified' | 'bounced';

export interface PaymentCollection {
  _id: string;
  receiptNumber: string;
  employeeId: string | { _id: string; firstName: string; lastName: string };
  clientId: string | { _id: string; name: string; company?: string };
  amount: number;
  method: FieldPaymentMethod;
  reference?: string;
  collectedAt: string;
  orderId?: string | { _id: string; orderNumber: string; totalAmount: number };
  notes?: string;
  status: PaymentCollectionStatus;
  createdAt: string;
}

export interface PaymentCollectionInput {
  clientId: string;
  employeeId?: string;
  amount: number;
  method: FieldPaymentMethod;
  reference?: string;
  collectedAt?: string;
  visitId?: string;
  orderId?: string;
  notes?: string;
}

export interface LiveLocation {
  employeeId: string;
  employee?: { firstName: string; lastName: string; employeeCode?: string; avatar?: string };
  timestamp: string;
  lat: number;
  lng: number;
  battery?: number;
  activity?: string;
  speed?: number;
}

export interface TrackPoint {
  timestamp: string;
  lat: number;
  lng: number;
  speed?: number;
  activity?: string;
  battery?: number;
}

export interface FieldDashboard {
  visitsToday: number;
  tasksCompleted: number;
  orders: { count: number; total: number };
  payments: { count: number; total: number };
  recentActivity: FieldVisit[];
}

export interface DailyPaymentReport {
  date: string;
  byMethod: Array<{ _id: FieldPaymentMethod; count: number; total: number }>;
  totals: { count: number; total: number };
}

export interface OutstandingReport {
  total: number;
  clients: Array<
    Pick<FieldClient, '_id' | 'name' | 'company' | 'outstandingAmount' | 'totalPayments' | 'totalOrders'>
  >;
}

/* ──────────────────────────────────────────────────────────── */
/* API                                                           */
/* ──────────────────────────────────────────────────────────── */

export const fieldApi = {
  // dashboard
  dashboard: async (): Promise<ItemResponse<FieldDashboard>> =>
    (await api.get('/field/dashboard')).data,

  // clients
  listClients: async (params?: Record<string, unknown>): Promise<ListResponse<FieldClient>> =>
    (await api.get('/field/clients', { params })).data,
  nearbyClients: async (params: { lat: number; lng: number; radius?: number; limit?: number }) =>
    (await api.get<{ success: boolean; data: FieldClient[] }>('/field/clients/nearby', { params }))
      .data,
  clientsMap: async (): Promise<{ success: boolean; data: FieldClient[] }> =>
    (await api.get('/field/clients/map')).data,
  getClient: async (id: string): Promise<ItemResponse<FieldClient>> =>
    (await api.get(`/field/clients/${id}`)).data,
  createClient: async (input: FieldClientInput): Promise<ItemResponse<FieldClient>> =>
    (await api.post('/field/clients', input)).data,
  updateClient: async (
    id: string,
    input: Partial<FieldClientInput>,
  ): Promise<ItemResponse<FieldClient>> => (await api.patch(`/field/clients/${id}`, input)).data,
  deleteClient: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/clients/${id}`)).data,
  addClientNote: async (id: string, text: string): Promise<ItemResponse<FieldClient>> =>
    (await api.post(`/field/clients/${id}/notes`, { text })).data,

  // visits
  listVisits: async (params?: Record<string, unknown>): Promise<ListResponse<FieldVisit>> =>
    (await api.get('/field/visits', { params })).data,
  todayVisits: async (): Promise<{ success: boolean; data: FieldVisit[] }> =>
    (await api.get('/field/visits/today')).data,
  getVisit: async (id: string): Promise<ItemResponse<FieldVisit>> =>
    (await api.get(`/field/visits/${id}`)).data,
  createVisit: async (input: VisitInput): Promise<ItemResponse<FieldVisit>> =>
    (await api.post('/field/visits', input)).data,
  updateVisit: async (
    id: string,
    input: Partial<FieldVisit>,
  ): Promise<ItemResponse<FieldVisit>> => (await api.patch(`/field/visits/${id}`, input)).data,
  deleteVisit: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/visits/${id}`)).data,
  checkIn: async (input: {
    clientId: string;
    purpose?: VisitPurpose;
    checkIn: VisitCheckpoint;
  }): Promise<ItemResponse<FieldVisit>> => (await api.post('/field/visits/check-in', input)).data,
  checkOut: async (
    id: string,
    input: { checkOut: VisitCheckpoint; notes?: string; outcome?: VisitOutcome },
  ): Promise<ItemResponse<FieldVisit>> =>
    (await api.post(`/field/visits/${id}/check-out`, input)).data,
  visitTimeline: async (
    employeeId: string,
    date?: string,
  ): Promise<{ success: boolean; data: FieldVisit[] }> =>
    (await api.get(`/field/visits/timeline/${employeeId}`, { params: { date } })).data,

  // tasks
  listTasks: async (params?: Record<string, unknown>): Promise<ListResponse<FieldTask>> =>
    (await api.get('/field/tasks', { params })).data,
  myTasks: async (): Promise<{ success: boolean; data: FieldTask[] }> =>
    (await api.get('/field/tasks/my')).data,
  teamTasks: async (): Promise<{ success: boolean; data: FieldTask[] }> =>
    (await api.get('/field/tasks/team')).data,
  getTask: async (id: string): Promise<ItemResponse<FieldTask>> =>
    (await api.get(`/field/tasks/${id}`)).data,
  createTask: async (input: FieldTaskInput): Promise<ItemResponse<FieldTask>> =>
    (await api.post('/field/tasks', input)).data,
  updateTask: async (
    id: string,
    input: Partial<FieldTaskInput>,
  ): Promise<ItemResponse<FieldTask>> => (await api.patch(`/field/tasks/${id}`, input)).data,
  deleteTask: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/tasks/${id}`)).data,
  acceptTask: async (id: string): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}/accept`)).data,
  completeTask: async (
    id: string,
    input: { completionPhotos?: string[]; completionNotes?: string },
  ): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}/complete`, input)).data,

  // targets
  listTargets: async (params?: Record<string, unknown>): Promise<ListResponse<SalesTarget>> =>
    (await api.get('/field/targets', { params })).data,
  myTargets: async (): Promise<{ success: boolean; data: SalesTarget[] }> =>
    (await api.get('/field/targets/my')).data,
  leaderboard: async (params?: {
    month?: number;
    year?: number;
    type?: TargetType;
  }): Promise<{ success: boolean; data: SalesTarget[] }> =>
    (await api.get('/field/targets/leaderboard', { params })).data,
  teamSummary: async (params?: { month?: number; year?: number }): Promise<{
    success: boolean;
    data: {
      totalTarget: number;
      totalAchieved: number;
      percentage: number;
      employees: number;
      details: SalesTarget[];
    };
  }> => (await api.get('/field/targets/team-summary', { params })).data,
  getTarget: async (id: string): Promise<ItemResponse<SalesTarget>> =>
    (await api.get(`/field/targets/${id}`)).data,
  createTarget: async (input: SalesTargetInput): Promise<ItemResponse<SalesTarget>> =>
    (await api.post('/field/targets', input)).data,
  updateTarget: async (
    id: string,
    input: Partial<SalesTargetInput>,
  ): Promise<ItemResponse<SalesTarget>> => (await api.patch(`/field/targets/${id}`, input)).data,
  deleteTarget: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/targets/${id}`)).data,

  // orders
  listOrders: async (params?: Record<string, unknown>): Promise<ListResponse<ProductOrder>> =>
    (await api.get('/field/orders', { params })).data,
  myOrders: async (): Promise<{ success: boolean; data: ProductOrder[] }> =>
    (await api.get('/field/orders/my')).data,
  orderReports: async (params?: { from?: string; to?: string }): Promise<{
    success: boolean;
    data: {
      from: string;
      to: string;
      byStatus: Array<{ _id: OrderStatus; count: number; total: number }>;
      totals: { count: number; total: number; paid: number };
    };
  }> => (await api.get('/field/orders/reports', { params })).data,
  getOrder: async (id: string): Promise<ItemResponse<ProductOrder>> =>
    (await api.get(`/field/orders/${id}`)).data,
  createOrder: async (input: ProductOrderInput): Promise<ItemResponse<ProductOrder>> =>
    (await api.post('/field/orders', input)).data,
  updateOrder: async (
    id: string,
    input: Partial<ProductOrderInput>,
  ): Promise<ItemResponse<ProductOrder>> => (await api.patch(`/field/orders/${id}`, input)).data,
  deleteOrder: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/orders/${id}`)).data,
  updateOrderStatus: async (
    id: string,
    status: OrderStatus,
  ): Promise<ItemResponse<ProductOrder>> =>
    (await api.patch(`/field/orders/${id}/status`, { status })).data,

  // payments
  listPayments: async (
    params?: Record<string, unknown>,
  ): Promise<ListResponse<PaymentCollection>> =>
    (await api.get('/field/payments', { params })).data,
  myPayments: async (): Promise<{ success: boolean; data: PaymentCollection[] }> =>
    (await api.get('/field/payments/my')).data,
  paymentsDaily: async (date?: string): Promise<{
    success: boolean;
    data: DailyPaymentReport;
  }> => (await api.get('/field/payments/reports/daily', { params: { date } })).data,
  paymentsOutstanding: async (): Promise<{ success: boolean; data: OutstandingReport }> =>
    (await api.get('/field/payments/reports/outstanding')).data,
  getPayment: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.get(`/field/payments/${id}`)).data,
  createPayment: async (
    input: PaymentCollectionInput,
  ): Promise<ItemResponse<PaymentCollection>> =>
    (await api.post('/field/payments', input)).data,
  verifyPayment: async (id: string): Promise<ItemResponse<PaymentCollection>> =>
    (await api.patch(`/field/payments/${id}/verify`)).data,
  deletePayment: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/payments/${id}`)).data,

  // tracking
  trackingBatch: async (
    points: Array<{
      timestamp?: string;
      lat: number;
      lng: number;
      accuracy?: number;
      speed?: number;
      activity?: string;
      battery?: number;
    }>,
  ): Promise<{ success: boolean; data: { ingested: number } }> =>
    (await api.post('/field/tracking/batch', { points })).data,
  liveTracking: async (): Promise<{ success: boolean; data: LiveLocation[] }> =>
    (await api.get('/field/tracking/live')).data,
  trackingHistory: async (
    employeeId: string,
    date?: string,
  ): Promise<{ success: boolean; data: TrackPoint[] }> =>
    (await api.get(`/field/tracking/history/${employeeId}`, { params: { date } })).data,
};
