import { useState, useEffect, type ReactElement } from 'react';
import { toast } from 'sonner';
import { Clock, LogIn, LogOut, Coffee, Play, Square } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  useTodayAttendance,
  useCheckIn,
  useCheckOut,
  useStartBreak,
  useEndBreak,
  useAttendanceConfig,
} from '@/hooks/use-attendance';
import type { AttendanceMethod, CheckInPayload } from '@/lib/attendance.api';
import {
  LocationPermissionDialog,
  type LocationFailureReason,
} from '@/components/common/LocationPermissionDialog';
import { CheckoutExpenseDialog, isExpenseRequiredError } from '@/components/attendance/CheckoutExpenseDialog';

const METHOD_LABELS: Record<AttendanceMethod, string> = {
  manual: 'Manual',
  face: 'Face Recognition',
  qr: 'Static QR',
  dynamic_qr: 'Dynamic QR',
  ip: 'Office IP',
  site: 'Site GPS',
  geofence: 'Geofence',
  device: 'Device',
};

function formatTime(d?: string): string {
  if (!d) return '—';
  return new Date(d).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

type LocationResult =
  | { ok: true; loc: { lat: number; lng: number; accuracy: number } }
  | { ok: false; reason: LocationFailureReason };

async function getLocation(): Promise<LocationResult> {
  if (!navigator.geolocation) return { ok: false, reason: 'unsupported' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          ok: true,
          loc: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy },
        }),
      (err) =>
        resolve({
          ok: false,
          reason:
            err.code === err.PERMISSION_DENIED
              ? 'denied'
              : err.code === err.POSITION_UNAVAILABLE
                ? 'unavailable'
                : 'timeout',
        }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

function isLocationRequiredError(e: unknown): boolean {
  const err = e as { response?: { data?: { error?: { code?: string } } } };
  return err.response?.data?.error?.code === 'LOCATION_REQUIRED';
}

export function CheckInWidget(): ReactElement {
  const { data: cfgRes } = useAttendanceConfig();
  const { data: todayRes } = useTodayAttendance();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();

  // Face recognition is not offered: the server has no face check and
  // refuses it (METHOD_UNAVAILABLE), so a stored config listing it first must
  // not make it the default.
  const configured = (cfgRes?.data.enabledMethods ?? ['manual']).filter((m) => m !== 'face');
  const enabledMethods: AttendanceMethod[] = configured.length > 0 ? configured : ['manual'];
  const today = todayRes?.data;
  const [method, setMethod] = useState<AttendanceMethod>(enabledMethods[0] ?? 'manual');
  // Today's expense form — only when a check-out answers EXPENSE_REQUIRED_FOR_CHECKOUT.
  const [expenseOpen, setExpenseOpen] = useState(false);
  // kind is unset when the failure came from the proactive on-mount check —
  // there is no pending check-in/out to resume after the user fixes location.
  const [locFailure, setLocFailure] = useState<{
    reason: LocationFailureReason;
    kind?: 'in' | 'out';
  } | null>(null);
  const [locRetrying, setLocRetrying] = useState(false);


  const firstMethod = enabledMethods[0] ?? 'manual';
  const methodOffered = enabledMethods.includes(method);
  useEffect(() => {
    if (!methodOffered) setMethod(firstMethod);
  }, [methodOffered, firstMethod]);

  const isCheckedIn = !!today?.checkIn?.time;
  const isCheckedOut = !!today?.checkOut?.time;
  const openBreak = today?.breaks?.find((b) => !b.endTime);

  const submit = async (kind: 'in' | 'out'): Promise<void> => {
    const payload: CheckInPayload = { method };
    const res = await getLocation();
    const isLocRequiredGlobal = cfgRes?.data.settings?.requireLocation === true;

    if (res.ok) {
      payload.location = res.loc;
    } else if (['site', 'geofence'].includes(method) || isLocRequiredGlobal) {
      // If the location is structurally required for the method or globally required by admin,
      // stop here and show the permission help dialog instead of hitting the backend.
      setLocFailure({ reason: res.reason, kind });
      return;
    }
    // Otherwise send without a location and let the server decide: it rejects
    // with LOCATION_REQUIRED only for employees whose admin turned the
    // per-employee location requirement on. Blocking everyone here would
    // apply the rule to staff it was never meant for.
    await send(kind, payload, res.ok ? 'unavailable' : res.reason);
  };

  /**
   * Check in/out. Other errors are already toasted (once) by the global
   * mutation handler; LOCATION_REQUIRED gets the permission dialog, and
   * EXPENSE_REQUIRED_FOR_CHECKOUT opens today's expense form, which checks
   * out again once the claim is filed.
   */
  const send = async (kind: 'in' | 'out', payload: CheckInPayload, locReason: LocationFailureReason): Promise<void> => {
    try {
      if (kind === 'in') {
        await checkIn.mutateAsync(payload);
      } else {
        await checkOut.mutateAsync(payload);
        setExpenseOpen(false);
      }
    } catch (e: unknown) {
      if (isLocationRequiredError(e)) {
        setLocFailure({ reason: locReason, kind });
      } else if (kind === 'out' && isExpenseRequiredError(e)) {
        setExpenseOpen(true);
      }
    }
  };

  const retryLocation = async (): Promise<void> => {
    if (!locFailure) return;
    const { kind } = locFailure;
    setLocRetrying(true);
    const res = await getLocation();
    setLocRetrying(false);
    if (!res.ok) {
      setLocFailure({ reason: res.reason, kind });
      return;
    }
    setLocFailure(null);
    toast.success('Location enabled');
    if (!kind) return; // proactive check — nothing pending to submit
    await send(kind, { method, location: res.loc }, 'unavailable');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Clock className="size-5" />
          Today
        </CardTitle>
        <Badge variant={isCheckedOut ? 'secondary' : isCheckedIn ? 'success' : 'outline'}>
          {isCheckedOut ? 'Checked Out' : isCheckedIn ? 'Working' : 'Not Checked In'}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Check-in</p>
            <p className="font-semibold">{formatTime(today?.checkIn?.time)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Check-out</p>
            <p className="font-semibold">{formatTime(today?.checkOut?.time)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Hours</p>
            <p className="font-semibold">{(today?.totalWorkingHours ?? 0).toFixed(2)}h</p>
          </div>
        </div>

        {!isCheckedOut && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Method</label>
              <Select value={method} onChange={(e) => setMethod(e.target.value as AttendanceMethod)}>
                {enabledMethods.map((m) => (
                  <option key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </option>
                ))}
              </Select>
            </div>
            {!isCheckedIn ? (
              <Button onClick={() => submit('in')} loading={checkIn.isPending}>
                <LogIn className="mr-2 size-4" />
                Check In
              </Button>
            ) : (
              <>
                {openBreak ? (
                  <Button variant="outline" onClick={() => endBreak.mutate()} loading={endBreak.isPending}>
                    <Square className="mr-2 size-4" />
                    End Break
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => startBreak.mutate('other')}
                    loading={startBreak.isPending}
                  >
                    <Coffee className="mr-2 size-4" />
                    Start Break
                  </Button>
                )}
                <Button variant="destructive" onClick={() => submit('out')} loading={checkOut.isPending}>
                  <LogOut className="mr-2 size-4" />
                  Check Out
                </Button>
              </>
            )}
          </div>
        )}

        {today?.breaks && today.breaks.length > 0 && (
          <div className="rounded-md border border-border p-3 text-xs">
            <p className="mb-1 font-medium">Breaks</p>
            {today.breaks.map((b, i) => (
              <div key={i} className="flex items-center justify-between text-muted-foreground">
                <span>
                  <Play className="mr-1 inline size-3" />
                  {formatTime(b.startTime)} → {formatTime(b.endTime)}
                </span>
                {b.duration && <span>{b.duration} min</span>}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CheckoutExpenseDialog
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        onFiled={() => void submit('out')}
        checkingOut={checkOut.isPending}
      />

      <LocationPermissionDialog
        open={!!locFailure}
        reason={locFailure?.reason ?? 'unavailable'}
        onClose={() => setLocFailure(null)}
        onRetry={retryLocation}
        retrying={locRetrying}
      />
    </Card>
  );
}
