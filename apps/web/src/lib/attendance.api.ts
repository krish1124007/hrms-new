import { api } from './axios';
import type { ListResponse, ItemResponse } from './systemcore.api';

export type AttendanceMethod =
  | 'face'
  | 'qr'
  | 'dynamic_qr'
  | 'ip'
  | 'site'
  | 'geofence'
  | 'device'
  | 'manual';

export type AttendanceStatus =
  | 'present'
  | 'absent'
  | 'half_day'
  | 'late'
  | 'on_leave'
  | 'holiday'
  | 'weekend';

export type BreakType = 'tea' | 'lunch' | 'personal' | 'other';
export type RegularizationStatus = 'pending' | 'approved' | 'rejected';

export interface LocationPoint {
  lat?: number;
  lng?: number;
  accuracy?: number;
  address?: string;
}

export interface CheckinRecord {
  time?: string;
  method?: AttendanceMethod;
  location?: LocationPoint;
  photo?: string;
  metadata?: Record<string, unknown>;
}

export interface BreakRecord {
  _id?: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  type: BreakType;
}

export interface Attendance {
  _id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employeeId: string | { _id: string; firstName: string; lastName: string; employeeId?: string };
  date: string;
  checkIn?: CheckinRecord;
  checkOut?: CheckinRecord;
  breaks: BreakRecord[];
  totalWorkingHours: number;
  overtimeHours: number;
  status: AttendanceStatus;
  lateBy: number;
  earlyLeaveBy: number;
  isRegularized: boolean;
  regularization?: {
    requestedAt: string;
    reason: string;
    status: RegularizationStatus;
    approvedAt?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceConfig {
  _id: string;
  enabledMethods: AttendanceMethod[];
  settings: {
    autoCheckoutTime?: string;
    overtimeThresholdMinutes: number;
    lateMarkAfterMinutes: number;
    halfDayThresholdHours: number;
    requirePhotoOnCheckIn: boolean;
    requireNoteOnLateCheckIn: boolean;
    freeLateDaysPerMonth: number;
  };
}

export interface CheckInPayload {
  method: AttendanceMethod;
  location?: LocationPoint;
  photo?: string;
  qrCode?: string;
  siteId?: string;
  geofenceId?: string;
  deviceId?: string;
  faceConfidence?: number;
  liveness?: boolean;
  note?: string;
  deviceInfo?: { model?: string; os?: string; appVersion?: string };
}

export interface AttendanceSite {
  _id: string;
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  radius: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assignedEmployees: any[];
  isActive: boolean;
}

export interface SiteInput {
  name: string;
  address?: string;
  location: { lat: number; lng: number };
  radius?: number;
  assignedEmployees?: string[];
  isActive?: boolean;
}

export interface GeofenceZone {
  _id: string;
  name: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates: { lat: number; lng: number }[];
  autoCheckIn: boolean;
  autoCheckOut: boolean;
  isActive: boolean;
}

export interface GeofenceInput {
  name: string;
  type: 'circle' | 'polygon';
  center?: { lat: number; lng: number };
  radius?: number;
  coordinates?: { lat: number; lng: number }[];
  autoCheckIn?: boolean;
  autoCheckOut?: boolean;
  isActive?: boolean;
}

export interface QRCodeRecord {
  _id: string;
  code: string;
  type: 'static' | 'dynamic';
  locationId?: string;
  expiresAt?: string;
  isActive: boolean;
  createdAt: string;
}

export interface AllowedIP {
  _id: string;
  label: string;
  ipAddress?: string;
  ipRangeStart?: string;
  ipRangeEnd?: string;
  locationId?: string;
  isActive: boolean;
}

export interface AllowedIPInput {
  label: string;
  ipAddress?: string;
  ipRangeStart?: string;
  ipRangeEnd?: string;
  locationId?: string;
  isActive?: boolean;
}

export interface AttendanceDashboard {
  totals: {
    totalEmployees: number;
    present: number;
    late: number;
    halfDay: number;
    onLeave: number;
    absent: number;
  };
  heatmap: { _id: string; present: number; absent: number }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lateComers: any[];
}

export const attendanceApi = {
  // config
  getConfig: async (): Promise<ItemResponse<AttendanceConfig>> =>
    (await api.get('/attendance/config')).data,
  updateConfig: async (input: Partial<AttendanceConfig>): Promise<ItemResponse<AttendanceConfig>> =>
    (await api.put('/attendance/config', input)).data,

  // check-in/out
  checkIn: async (payload: CheckInPayload): Promise<ItemResponse<Attendance>> =>
    (await api.post('/attendance/check-in', payload)).data,
  checkOut: async (payload: CheckInPayload): Promise<ItemResponse<Attendance>> =>
    (await api.post('/attendance/check-out', payload)).data,
  startBreak: async (type: BreakType = 'other'): Promise<ItemResponse<Attendance>> =>
    (await api.post('/attendance/breaks/start', { type })).data,
  endBreak: async (): Promise<ItemResponse<Attendance>> =>
    (await api.post('/attendance/breaks/end')).data,

  // records
  list: async (params?: Record<string, unknown>): Promise<ListResponse<Attendance>> =>
    (await api.get('/attendance/records', { params })).data,
  my: async (params?: Record<string, unknown>): Promise<ListResponse<Attendance>> =>
    (await api.get('/attendance/my', { params })).data,
  today: async (): Promise<ItemResponse<Attendance | null>> =>
    (await api.get('/attendance/today')).data,
  monthly: async (
    year: number,
    month: number,
    employeeId?: string,
  ): Promise<{ success: boolean; data: Attendance[] }> =>
    (await api.get('/attendance/monthly', { params: { year, month, employeeId } })).data,
  regularize: async (date: string, reason: string): Promise<ItemResponse<Attendance>> =>
    (await api.post('/attendance/regularize', { date, reason })).data,
  decideRegularization: async (
    id: string,
    status: 'approved' | 'rejected',
  ): Promise<ItemResponse<Attendance>> =>
    (await api.patch(`/attendance/regularize/${id}`, { status })).data,
  dashboard: async (
    departmentId?: string,
  ): Promise<{ success: boolean; data: AttendanceDashboard }> =>
    (await api.get('/attendance/dashboard', { params: { departmentId } })).data,
  report: async (
    from: string,
    to: string,
    departmentId?: string,
  ): Promise<{ success: boolean; data: Attendance[] }> =>
    (await api.get('/attendance/report', { params: { from, to, departmentId } })).data,

  // sites
  listSites: async (params?: Record<string, unknown>): Promise<ListResponse<AttendanceSite>> =>
    (await api.get('/attendance/sites', { params })).data,
  getSite: async (id: string): Promise<ItemResponse<AttendanceSite>> =>
    (await api.get(`/attendance/sites/${id}`)).data,
  createSite: async (input: SiteInput): Promise<ItemResponse<AttendanceSite>> =>
    (await api.post('/attendance/sites', input)).data,
  updateSite: async (id: string, input: Partial<SiteInput>): Promise<ItemResponse<AttendanceSite>> =>
    (await api.patch(`/attendance/sites/${id}`, input)).data,
  deleteSite: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/attendance/sites/${id}`)).data,
  assignEmployees: async (
    id: string,
    employeeIds: string[],
  ): Promise<ItemResponse<AttendanceSite>> =>
    (await api.post(`/attendance/sites/${id}/assign`, { employeeIds })).data,

  // geofences
  listGeofences: async (params?: Record<string, unknown>): Promise<ListResponse<GeofenceZone>> =>
    (await api.get('/attendance/geofences', { params })).data,
  createGeofence: async (input: GeofenceInput): Promise<ItemResponse<GeofenceZone>> =>
    (await api.post('/attendance/geofences', input)).data,
  updateGeofence: async (
    id: string,
    input: Partial<GeofenceInput>,
  ): Promise<ItemResponse<GeofenceZone>> =>
    (await api.patch(`/attendance/geofences/${id}`, input)).data,
  deleteGeofence: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/attendance/geofences/${id}`)).data,

  // qr codes
  listQRCodes: async (params?: Record<string, unknown>): Promise<ListResponse<QRCodeRecord>> =>
    (await api.get('/attendance/qr-codes', { params })).data,
  createQRCode: async (input: {
    type: 'static' | 'dynamic';
    locationId?: string;
    expiresAt?: string;
  }): Promise<ItemResponse<QRCodeRecord>> => (await api.post('/attendance/qr-codes', input)).data,
  rotateDynamicQR: async (): Promise<{
    success: boolean;
    data: { code: string; expiresAt: string; ttlSeconds: number };
  }> => (await api.post('/attendance/qr-codes/rotate')).data,
  deleteQRCode: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/attendance/qr-codes/${id}`)).data,

  // allowed ips
  listAllowedIPs: async (params?: Record<string, unknown>): Promise<ListResponse<AllowedIP>> =>
    (await api.get('/attendance/allowed-ips', { params })).data,
  createAllowedIP: async (input: AllowedIPInput): Promise<ItemResponse<AllowedIP>> =>
    (await api.post('/attendance/allowed-ips', input)).data,
  updateAllowedIP: async (
    id: string,
    input: Partial<AllowedIPInput>,
  ): Promise<ItemResponse<AllowedIP>> =>
    (await api.patch(`/attendance/allowed-ips/${id}`, input)).data,
  deleteAllowedIP: async (id: string): Promise<{ success: boolean; message: string }> =>
    (await api.delete(`/attendance/allowed-ips/${id}`)).data,
};
