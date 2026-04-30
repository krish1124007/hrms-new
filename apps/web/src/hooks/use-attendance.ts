import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  attendanceApi,
  type CheckInPayload,
  type SiteInput,
  type GeofenceInput,
  type AllowedIPInput,
  type AttendanceConfig,
  type BreakType,
} from '@/lib/attendance.api';

const errMsg = (err: unknown, fallback: string) => {
  const e = err as { response?: { data?: { error?: { message?: string } } } };
  return e.response?.data?.error?.message ?? fallback;
};

/* ── Config ── */
export function useAttendanceConfig() {
  return useQuery({
    queryKey: ['attendance-config'],
    queryFn: () => attendanceApi.getConfig(),
  });
}
export function useUpdateAttendanceConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<AttendanceConfig>) => attendanceApi.updateConfig(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-config'] });
      toast.success('Attendance settings saved');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to save settings')),
  });
}

/* ── Check-in / Out ── */
export function useTodayAttendance() {
  return useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => attendanceApi.today(),
    refetchInterval: 60_000,
  });
}
export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CheckInPayload) => attendanceApi.checkIn(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-my'] });
      toast.success('Checked in successfully');
    },
    onError: (e) => toast.error(errMsg(e, 'Check-in failed')),
  });
}
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CheckInPayload) => attendanceApi.checkOut(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-today'] });
      qc.invalidateQueries({ queryKey: ['attendance-my'] });
      toast.success('Checked out successfully');
    },
    onError: (e) => toast.error(errMsg(e, 'Check-out failed')),
  });
}
export function useStartBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: BreakType) => attendanceApi.startBreak(type),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-today'] }),
    onError: (e) => toast.error(errMsg(e, 'Failed to start break')),
  });
}
export function useEndBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => attendanceApi.endBreak(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-today'] }),
    onError: (e) => toast.error(errMsg(e, 'Failed to end break')),
  });
}

/* ── Records ── */
export function useAttendanceList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-list', params],
    queryFn: () => attendanceApi.list(params),
  });
}
export function useMyAttendance(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-my', params],
    queryFn: () => attendanceApi.my(params),
  });
}
export function useMonthlyAttendance(year: number, month: number, employeeId?: string) {
  return useQuery({
    queryKey: ['attendance-monthly', year, month, employeeId],
    queryFn: () => attendanceApi.monthly(year, month, employeeId),
  });
}
export function useAttendanceDashboard(departmentId?: string) {
  return useQuery({
    queryKey: ['attendance-dashboard', departmentId],
    queryFn: () => attendanceApi.dashboard(departmentId),
  });
}
export function useRequestRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, reason }: { date: string; reason: string }) =>
      attendanceApi.regularize(date, reason),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-my'] });
      qc.invalidateQueries({ queryKey: ['attendance-list'] });
      toast.success('Regularization requested');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to request regularization')),
  });
}
export function useDecideRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      attendanceApi.decideRegularization(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-list'] });
      toast.success('Regularization updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update regularization')),
  });
}

/* ── Sites ── */
export function useAttendanceSites(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-sites', params],
    queryFn: () => attendanceApi.listSites(params),
  });
}
export function useCreateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteInput) => attendanceApi.createSite(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sites'] });
      toast.success('Site created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create site')),
  });
}
export function useUpdateSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<SiteInput> }) =>
      attendanceApi.updateSite(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sites'] });
      toast.success('Site updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update site')),
  });
}
export function useDeleteSite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceApi.deleteSite(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-sites'] });
      toast.success('Site deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete site')),
  });
}

/* ── Geofences ── */
export function useGeofences(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-geofences', params],
    queryFn: () => attendanceApi.listGeofences(params),
  });
}
export function useCreateGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: GeofenceInput) => attendanceApi.createGeofence(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-geofences'] });
      toast.success('Geofence created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create geofence')),
  });
}
export function useUpdateGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<GeofenceInput> }) =>
      attendanceApi.updateGeofence(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-geofences'] });
      toast.success('Geofence updated');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to update geofence')),
  });
}
export function useDeleteGeofence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceApi.deleteGeofence(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-geofences'] });
      toast.success('Geofence deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete geofence')),
  });
}

/* ── QR Codes ── */
export function useQRCodes(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-qr', params],
    queryFn: () => attendanceApi.listQRCodes(params),
  });
}
export function useCreateQRCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: 'static' | 'dynamic'; locationId?: string; expiresAt?: string }) =>
      attendanceApi.createQRCode(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-qr'] });
      toast.success('QR code created');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to create QR code')),
  });
}
export function useDeleteQRCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceApi.deleteQRCode(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-qr'] });
      toast.success('QR code deleted');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to delete QR code')),
  });
}

/* ── Allowed IPs ── */
export function useAllowedIPs(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-ips', params],
    queryFn: () => attendanceApi.listAllowedIPs(params),
  });
}
export function useCreateAllowedIP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AllowedIPInput) => attendanceApi.createAllowedIP(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-ips'] });
      toast.success('IP added');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to add IP')),
  });
}
export function useDeleteAllowedIP() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => attendanceApi.deleteAllowedIP(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-ips'] });
      toast.success('IP removed');
    },
    onError: (e) => toast.error(errMsg(e, 'Failed to remove IP')),
  });
}

