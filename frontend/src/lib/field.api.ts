import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

/*
 * Field Visits API (`/api/v1/field/*`). Every read is scoped by the server:
 * `field.manage` sees everyone; `field.view` sees the signed-in employee's
 * own records and their direct reports'. Writes that can be retried carry a
 * `clientRef` (UUID v4) so a double submit creates one record.
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

export interface Address {
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export function refId(ref: string | { _id: string } | null | undefined): string {
  if (!ref) return '';
  return typeof ref === 'string' ? ref : ref._id;
}

export function personName(ref: string | FieldEmployeeRef | null | undefined): string {
  if (!ref || typeof ref === 'string') return '—';
  return `${ref.firstName} ${ref.lastName}`.trim();
}

/** A fresh idempotency reference (UUID v4) for one create. */
export function newClientRef(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // RFC 4122 v4 from Math.random — only for very old browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r % 4) + 8).toString(16);
  });
}

/* ──────────────────────────────────────────────────────────── */
/* Settings                                                      */
/* ──────────────────────────────────────────────────────────── */

export type VehicleType = 'bike' | 'car' | 'other';

export interface VehicleRate {
  type: VehicleType;
  label: string;
  /** ₹ per km. */
  ratePerKm: number;
}

export type ChecklistItemKind = 'yes_no' | 'text' | 'number' | 'select' | 'photo';

export interface ChecklistItem {
  /** Assigned by the server; new items are sent without one. */
  _id?: string;
  label: string;
  kind: ChecklistItemKind;
  /** `select` items only. */
  options?: string[];
  required: boolean;
}

export interface Checklist {
  _id?: string;
  name: string;
  /** The visit purpose this checklist is filled for. */
  purpose: string;
  items: ChecklistItem[];
}

export interface FieldSettings {
  selfieRequired: boolean;
  defaultSiteRadiusM: number;
  siteTypes: string[];
  visitPurposes: string[];
  shortVisitMinutes: number;
  /** `HH:mm` IST — visits still open then are closed and flagged. */
  autoCloseTime: string;
  offlineMaxAgeDays: number;
  visitCountsAsAttendance: boolean;
  vehicles: VehicleRate[];
  checklists: Checklist[];
}

/** The server's defaults — shown while the real settings load. */
export const DEFAULT_FIELD_SETTINGS: FieldSettings = {
  selfieRequired: true,
  defaultSiteRadiusM: 200,
  siteTypes: ['Client office', 'Project site', 'Branch', 'Vendor', 'Government office', 'Other'],
  visitPurposes: ['Meeting', 'Inspection', 'Audit', 'Survey', 'Installation', 'Maintenance', 'Training', 'Other'],
  shortVisitMinutes: 5,
  autoCloseTime: '23:30',
  offlineMaxAgeDays: 7,
  visitCountsAsAttendance: true,
  vehicles: [
    { type: 'bike', label: 'Two-wheeler', ratePerKm: 0 },
    { type: 'car', label: 'Car', ratePerKm: 0 },
  ],
  checklists: [],
};

/* ──────────────────────────────────────────────────────────── */
/* Sites                                                         */
/* ──────────────────────────────────────────────────────────── */

export type SiteCreatedVia = 'mobile_pin' | 'web';

export interface Site {
  _id: string;
  name: string;
  type: string;
  address: Address;
  location: LatLng;
  radiusM: number;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  photoUrl?: string;
  assignedTo: FieldEmployeeRef[];
  createdBy?: Pick<FieldEmployeeRef, '_id' | 'firstName' | 'lastName'> | null;
  createdVia: SiteCreatedVia;
  lastVisitAt?: string | null;
  visitCount: number;
  /** Present when the list was asked for `near=`. */
  distanceM?: number;
  createdAt?: string;
}

/** `POST /field/sites`. */
export interface SiteInput {
  clientRef: string;
  capturedAt?: string;
  name: string;
  type: string;
  location: LatLng & { accuracy?: number };
  radiusM?: number;
  address?: Address;
  contactName?: string;
  contactPhone?: string;
  notes?: string;
  /** Upload key from `POST /field/uploads/photo`. */
  photo?: string;
  assignedTo?: string[];
}

/** `PATCH /field/sites/:id` — any subset; an emptied text field goes as ''. */
export type SiteUpdate = Partial<Omit<SiteInput, 'clientRef' | 'capturedAt'>>;

/** One site on the map (`GET /field/sites/map`, ≤ 500 per view). */
export interface SitePin {
  _id: string;
  name: string;
  type: string;
  location: LatLng;
  radiusM: number;
  lastVisitAt?: string | null;
}

export const SITE_MAP_LIMIT = 500;

export interface SiteImportResult {
  created: number;
  updated: number;
  errors: Array<{ row: number; message: string }>;
}

/** The columns `POST /field/sites/import` reads, as laid out in the template. */
export const SITE_IMPORT_COLUMNS = [
  'Name',
  'Type',
  'Address',
  'City',
  'State',
  'Pincode',
  'Latitude',
  'Longitude',
  'Radius',
  'Contact name',
  'Contact phone',
  'Assigned employee IDs',
] as const;

/* ──────────────────────────────────────────────────────────── */
/* Visits                                                        */
/* ──────────────────────────────────────────────────────────── */

export type VisitStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'missed';
export type VisitOutcome = 'completed' | 'follow_up' | 'not_available' | 'other';

export interface VisitFlags {
  awayFromSite: boolean;
  noGps: boolean;
  noSelfie: boolean;
  shortVisit: boolean;
  autoClosed: boolean;
  syncedLate: boolean;
  capturedOffline: boolean;
}

export interface VisitPoint {
  at: string;
  location?: LatLng;
  accuracy?: number;
  /** Metres from the site's pin. */
  distanceM?: number;
}

export interface VisitSite {
  _id: string;
  name: string;
  type: string;
  location: LatLng;
  radiusM: number;
}

/** A checklist answer: yes/no as a boolean, numbers as numbers, a photo item as its URL. */
export type ChecklistAnswerValue = string | number | boolean | null;

export interface Report {
  notes: string;
  /** Signed URLs. */
  photos: string[];
  documents: Array<{ url: string; name: string }>;
  peopleMet: Array<{ name: string; designation?: string; phone?: string }>;
  outcome: VisitOutcome;
  nextAction?: string;
  followUpDate?: string;
  checklist?: { checklistId: string; answers: Array<{ itemId: string; value: ChecklistAnswerValue }> };
  submittedAt: string;
}

export interface Visit {
  _id: string;
  clientRef?: string;
  employee: FieldEmployeeRef;
  site: VisitSite;
  purpose: string;
  status: VisitStatus;
  plannedDate?: string;
  scheduleId?: string;
  /** Notes given when the visit was planned. */
  notes?: string;
  checkIn?: VisitPoint & { selfieUrl?: string };
  checkOut?: VisitPoint;
  durationMinutes?: number;
  flags: Partial<VisitFlags>;
  report?: Report;
  cancelReason?: string;
  createdAt: string;
}

/** A visit in a site's history (`GET /field/sites/:id` → `recentVisits`). */
export type VisitSummary = Pick<Visit, '_id' | 'status' | 'purpose'> &
  Partial<Pick<Visit, 'employee' | 'plannedDate' | 'checkIn' | 'checkOut' | 'durationMinutes' | 'flags'>> & {
    report?: Partial<Report>;
  };

export type SiteDetail = Site & { recentVisits: VisitSummary[] };

export interface PlanVisitInput {
  siteId: string;
  /** Omitted: the signed-in employee. */
  employeeId?: string;
  /** `YYYY-MM-DD` (IST). */
  plannedDate: string;
  purpose: string;
  notes?: string;
}

export interface MyDay {
  date: string;
  inProgress: Visit | null;
  planned: Visit[];
  completed: Visit[];
  missed: Visit[];
  tasks: FieldTask[];
  attendance: { checkedInAt?: string | null; checkedOutAt?: string | null };
}

/* ──────────────────────────────────────────────────────────── */
/* Recurring schedules                                           */
/* ──────────────────────────────────────────────────────────── */

export interface ScheduleRule {
  freq: 'weekly' | 'monthly';
  /** 1 = Monday … 7 = Sunday. */
  weekdays?: number[];
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
}

type SiteRef = Pick<VisitSite, '_id' | 'name'> & Partial<VisitSite>;

export interface VisitSchedule {
  _id: string;
  /** Populated as an object by the list, or a bare id. */
  siteId: string | SiteRef;
  employeeId: string | FieldEmployeeRef;
  site?: SiteRef;
  employee?: FieldEmployeeRef;
  purpose: string;
  rule: ScheduleRule;
  createdAt?: string;
}

export interface VisitScheduleInput {
  siteId: string;
  employeeId: string;
  purpose: string;
  rule: ScheduleRule;
}

/* ──────────────────────────────────────────────────────────── */
/* Tasks at a site                                               */
/* ──────────────────────────────────────────────────────────── */

export type FieldTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type FieldTaskStatus = 'new' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';

export interface FieldTask {
  _id: string;
  title: string;
  description?: string;
  assignedTo: string | FieldEmployeeRef;
  siteId?: string | { _id: string; name: string; address?: Address } | null;
  priority: FieldTaskPriority;
  status: FieldTaskStatus;
  dueDate?: string;
  completedAt?: string;
  /** Signed URLs. */
  completionPhotos: string[];
  completionNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FieldTaskInput {
  title: string;
  description?: string;
  assignedTo: string;
  siteId?: string;
  priority?: FieldTaskPriority;
  status?: FieldTaskStatus;
  dueDate?: string;
}

/** `null` clears an optional field on an update (the server `$unset`s it). */
type Clearable<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };

/** A task edit: a cleared description, site or due date goes as `null`. */
export type FieldTaskUpdate = Clearable<Partial<FieldTaskInput>, 'description' | 'siteId' | 'dueDate'>;

export interface TaskCompletionInput {
  completionNotes?: string;
  /** Upload keys from `POST /field/uploads/photo`. */
  photoKeys?: string[];
}

/* ──────────────────────────────────────────────────────────── */
/* Tracking — kept for the team map and day route pages until    */
/* they move to `/team/status` and `/route/:employeeId`.         */
/* ──────────────────────────────────────────────────────────── */

/** A person's newest point in the last 2 h (`GET /field/tracking/live`). */
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

/** A visit pin on the day route. */
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
  status: string;
  purpose: string;
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

/* ──────────────────────────────────────────────────────────── */
/* API                                                           */
/* ──────────────────────────────────────────────────────────── */

type Ok<T> = { success: boolean; data: T };

export const fieldApi = {
  // settings
  getSettings: async (): Promise<Ok<FieldSettings>> => (await api.get('/field/settings')).data,
  updateSettings: async (input: FieldSettings): Promise<Ok<FieldSettings>> =>
    (await api.put('/field/settings', input)).data,

  // uploads — `key` goes into request bodies, `url` is a short-lived preview
  uploadPhoto: async (file: File): Promise<Ok<{ url: string; key: string }>> => {
    const fd = new FormData();
    fd.append('photo', file);
    return (await api.post('/field/uploads/photo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },

  // sites
  listSites: async (params?: Record<string, unknown>): Promise<ListResponse<Site>> =>
    (await api.get('/field/sites', { params })).data,
  /** `bbox` = `minLng,minLat,maxLng,maxLat`; ≤ 500 pins. */
  sitesMap: async (bbox: string): Promise<Ok<SitePin[]>> =>
    (await api.get('/field/sites/map', { params: { bbox } })).data,
  getSite: async (id: string): Promise<ItemResponse<SiteDetail>> => (await api.get(`/field/sites/${id}`)).data,
  createSite: async (input: SiteInput): Promise<ItemResponse<Site>> => (await api.post('/field/sites', input)).data,
  updateSite: async (id: string, input: SiteUpdate): Promise<ItemResponse<Site>> =>
    (await api.patch(`/field/sites/${id}`, input)).data,
  deleteSite: async (id: string): Promise<{ success: boolean }> => (await api.delete(`/field/sites/${id}`)).data,
  importSites: async (file: File): Promise<Ok<SiteImportResult>> => {
    const fd = new FormData();
    fd.append('file', file);
    return (await api.post('/field/sites/import', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data;
  },

  // visits
  listVisits: async (params?: Record<string, unknown>): Promise<ListResponse<Visit>> =>
    (await api.get('/field/visits', { params })).data,
  getVisit: async (id: string): Promise<ItemResponse<Visit>> => (await api.get(`/field/visits/${id}`)).data,
  planVisit: async (input: PlanVisitInput): Promise<ItemResponse<Visit>> =>
    (await api.post('/field/visits/plan', input)).data,
  cancelVisit: async (id: string, reason: string): Promise<ItemResponse<Visit>> =>
    (await api.post(`/field/visits/${id}/cancel`, { reason })).data,
  myDay: async (date?: string): Promise<Ok<MyDay>> =>
    (await api.get('/field/my-day', { params: date ? { date } : undefined })).data,

  // recurring schedules
  listSchedules: async (params?: Record<string, unknown>): Promise<ListResponse<VisitSchedule>> =>
    (await api.get('/field/visit-schedules', { params })).data,
  createSchedule: async (input: VisitScheduleInput): Promise<ItemResponse<VisitSchedule>> =>
    (await api.post('/field/visit-schedules', input)).data,
  updateSchedule: async (id: string, input: Partial<VisitScheduleInput>): Promise<ItemResponse<VisitSchedule>> =>
    (await api.patch(`/field/visit-schedules/${id}`, input)).data,
  deleteSchedule: async (id: string): Promise<{ success: boolean }> =>
    (await api.delete(`/field/visit-schedules/${id}`)).data,

  // tasks at a site
  listTasks: async (params?: Record<string, unknown>): Promise<ListResponse<FieldTask>> =>
    (await api.get('/field/tasks', { params })).data,
  createTask: async (input: FieldTaskInput): Promise<ItemResponse<FieldTask>> =>
    (await api.post('/field/tasks', input)).data,
  updateTask: async (id: string, input: FieldTaskUpdate): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}`, input)).data,
  deleteTask: async (id: string): Promise<{ success: boolean }> => (await api.delete(`/field/tasks/${id}`)).data,
  acceptTask: async (id: string): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}/accept`)).data,
  completeTask: async (id: string, input: TaskCompletionInput): Promise<ItemResponse<FieldTask>> =>
    (await api.patch(`/field/tasks/${id}/complete`, input)).data,

  // tracking (team map / day route pages)
  liveTracking: async (): Promise<Ok<LiveLocation[]>> => (await api.get('/field/tracking/live')).data,
  /** One person's points and visits on an IST day (`YYYY-MM-DD`; default today). */
  trail: async (employeeId: string, date?: string): Promise<Ok<Trail>> =>
    (await api.get(`/field/tracking/${employeeId}/trail`, { params: date ? { date } : undefined })).data,
};
