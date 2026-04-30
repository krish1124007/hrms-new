import { useState, type ReactElement } from 'react';
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

async function getLocation(): Promise<{ lat: number; lng: number; accuracy: number } | null> {
  if (!navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}

export function CheckInWidget(): ReactElement {
  const { data: cfgRes } = useAttendanceConfig();
  const { data: todayRes } = useTodayAttendance();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const startBreak = useStartBreak();
  const endBreak = useEndBreak();

  const enabledMethods = cfgRes?.data.enabledMethods ?? ['manual'];
  const today = todayRes?.data;
  const [method, setMethod] = useState<AttendanceMethod>(enabledMethods[0] ?? 'manual');

  const isCheckedIn = !!today?.checkIn?.time;
  const isCheckedOut = !!today?.checkOut?.time;
  const openBreak = today?.breaks?.find((b) => !b.endTime);

  const submit = async (kind: 'in' | 'out'): Promise<void> => {
    const payload: CheckInPayload = { method };
    if (['site', 'geofence'].includes(method)) {
      const loc = await getLocation();
      if (!loc) return;
      payload.location = loc;
    }
    if (kind === 'in') checkIn.mutate(payload);
    else checkOut.mutate(payload);
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
    </Card>
  );
}
