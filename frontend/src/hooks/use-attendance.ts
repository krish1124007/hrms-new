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
  type RegularizationRequestInput,
  type RegularizationStatus,
} from '@/lib/attendance.api';


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

export function useMyShift() {
  return useQuery({
    queryKey: ['attendance-my-shift'],
    queryFn: () => attendanceApi.myShift(),
  });
}

// Invalidate every attendance view that could be affected by a check-in/out —
// the user's own widget AND any admin window watching the live dashboard or
// records list. Keeps multi-window/multi-tab views in sync.
function invalidateAllAttendance(qc: ReturnType<typeof useQueryClient>): void {
  qc.invalidateQueries({ queryKey: ['attendance-today'] });
  qc.invalidateQueries({ queryKey: ['attendance-my'] });
  qc.invalidateQueries({ queryKey: ['attendance-list'] });
  qc.invalidateQueries({ queryKey: ['attendance-dashboard'] });
  qc.invalidateQueries({ queryKey: ['attendance-monthly'] });
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CheckInPayload) => attendanceApi.checkIn(payload),
    onSuccess: () => {
      invalidateAllAttendance(qc);
      toast.success('Checked in successfully');
    },
    // Failures are toasted once by the global mutation handler, which leaves
    // LOCATION_REQUIRED to the caller's location help.
  });
}
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: CheckInPayload) => attendanceApi.checkOut(payload),
    onSuccess: () => {
      invalidateAllAttendance(qc);
      toast.success('Checked out successfully');
    },
    // Failures are toasted once by the global mutation handler. It skips
    // LOCATION_REQUIRED (the caller opens the location help) and
    // EXPENSE_REQUIRED_FOR_CHECKOUT (the caller opens today's expense form).
  });
}
export function useStartBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (type: BreakType) => attendanceApi.startBreak(type),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-today'] }),
  });
}
export function useEndBreak() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => attendanceApi.endBreak(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attendance-today'] }),
  });
}

/* ── Records ── */
// Auto-refresh interval for the live admin views. 30s is fast enough to feel
// live during a 9am check-in spike, light enough to not hammer the API.
const LIVE_REFETCH_MS = 30_000;

export function useAttendanceList(params?: Record<string, unknown>) {
  return useQuery({
    queryKey: ['attendance-list', params],
    queryFn: () => attendanceApi.list(params),
    refetchInterval: LIVE_REFETCH_MS,
    refetchOnWindowFocus: true,
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
    refetchInterval: LIVE_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
}
export function useAttendanceLiveTracking() {
  return useQuery({
    queryKey: ['attendance-live-tracking'],
    queryFn: () => attendanceApi.liveTracking(),
    refetchInterval: 15_000,
  });
}
export function useRequestRegularization() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegularizationRequestInput) => attendanceApi.regularize(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-my'] });
      qc.invalidateQueries({ queryKey: ['attendance-monthly'] });
      qc.invalidateQueries({ queryKey: ['attendance-list'] });
      qc.invalidateQueries({ queryKey: ['attendance-regularizations'] });
      toast.success('Regularization requested');
    },
  });
}

/** The approval queue for one status, newest request first. */
export function useRegularizations(params: { status: RegularizationStatus; page: number; limit?: number }) {
  return useQuery({
    queryKey: ['attendance-regularizations', params],
    queryFn: () => attendanceApi.listRegularizations(params),
  });
}

export function useDecideRegularization() {
  const qc = useQueryClient();
  const refresh = (): void => {
    qc.invalidateQueries({ queryKey: ['attendance-regularizations'] });
    qc.invalidateQueries({ queryKey: ['attendance-list'] });
    qc.invalidateQueries({ queryKey: ['attendance-monthly'] });
  };
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'approved' | 'rejected' }) =>
      attendanceApi.decideRegularization(id, status),
    onSuccess: (_d, vars) => {
      refresh();
      toast.success(vars.status === 'approved' ? 'Regularization approved' : 'Regularization rejected');
    },
    onError: () => {
      // 409 DECIDED_MEANWHILE / an already-decided request: the row is stale,
      // so reload the queue rather than leave it offering a dead decision.
      // The message itself is toasted once, by the global mutation handler
      // (main.tsx) — toasting here too showed it twice.
      refresh();
    },
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
  });
}
/** HR correction of a mis-punched record (missing check-out, wrong time). */
export function useCorrectAttendanceRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...body
    }: {
      id: string;
      checkIn?: string;
      checkOut?: string;
      reason: string;
    }) => attendanceApi.correctRecord(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-list'] });
      qc.invalidateQueries({ queryKey: ['attendance-my'] });
      qc.invalidateQueries({ queryKey: ['attendance-monthly'] });
      toast.success('Attendance record updated');
    },
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
  });
}

