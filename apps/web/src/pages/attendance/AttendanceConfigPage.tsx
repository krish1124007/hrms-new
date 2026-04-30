import { useEffect, useState, type ReactElement } from 'react';
import { Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAttendanceConfig, useUpdateAttendanceConfig } from '@/hooks/use-attendance';
import type { AttendanceMethod } from '@/lib/attendance.api';

const ALL_METHODS: { key: AttendanceMethod; label: string; desc: string }[] = [
  { key: 'manual', label: 'Manual', desc: 'Admin/HR records attendance manually' },
  { key: 'face', label: 'Face Recognition', desc: 'Selfie with liveness check' },
  { key: 'qr', label: 'Static QR', desc: 'Scan a fixed QR posted at the office' },
  { key: 'dynamic_qr', label: 'Dynamic QR', desc: 'Rotating QR shown on a screen' },
  { key: 'ip', label: 'Office IP', desc: 'Only allow check-in from approved IPs' },
  { key: 'site', label: 'Site GPS', desc: 'GPS distance from office site' },
  { key: 'geofence', label: 'Geofence', desc: 'Polygon or circle perimeter' },
  { key: 'device', label: 'Device', desc: 'Bound to a specific device ID' },
];

export default function AttendanceConfigPage(): ReactElement {
  const { data } = useAttendanceConfig();
  const updateMutation = useUpdateAttendanceConfig();

  const [enabled, setEnabled] = useState<AttendanceMethod[]>([]);
  const [lateAfter, setLateAfter] = useState(15);
  const [overtimeMin, setOvertimeMin] = useState(540);
  const [halfDay, setHalfDay] = useState(4);
  const [autoCheckout, setAutoCheckout] = useState('');
  const [requirePhoto, setRequirePhoto] = useState(false);
  const [freeLateDays, setFreeLateDays] = useState(3);

  useEffect(() => {
    if (data?.data) {
      const c = data.data;
      setEnabled(c.enabledMethods);
      setLateAfter(c.settings.lateMarkAfterMinutes ?? 15);
      setOvertimeMin(c.settings.overtimeThresholdMinutes ?? 540);
      setHalfDay(c.settings.halfDayThresholdHours ?? 4);
      setAutoCheckout(c.settings.autoCheckoutTime ?? '');
      setRequirePhoto(c.settings.requirePhotoOnCheckIn ?? false);
      setFreeLateDays(c.settings.freeLateDaysPerMonth ?? 3);
    }
  }, [data]);

  const toggle = (m: AttendanceMethod): void => {
    setEnabled((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const save = (): void => {
    updateMutation.mutate({
      enabledMethods: enabled.length ? enabled : ['manual'],
      settings: {
        lateMarkAfterMinutes: lateAfter,
        overtimeThresholdMinutes: overtimeMin,
        halfDayThresholdHours: halfDay,
        autoCheckoutTime: autoCheckout || undefined,
        requirePhotoOnCheckIn: requirePhoto,
        requireNoteOnLateCheckIn: false,
        freeLateDaysPerMonth: freeLateDays,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Attendance Settings"
        description="Configure check-in methods and rules"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Attendance', to: '/attendance' },
          { label: 'Settings' },
        ]}
        actions={
          <Button onClick={save} loading={updateMutation.isPending}>
            <Save className="mr-2 size-4" />
            Save
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Enabled check-in methods</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {ALL_METHODS.map((m) => (
            <label
              key={m.key}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={enabled.includes(m.key)}
                onChange={() => toggle(m.key)}
              />
              <div>
                <p className="font-medium">{m.label}</p>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rules</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="late">Late mark after (minutes)</Label>
            <Input
              id="late"
              type="number"
              value={lateAfter}
              onChange={(e) => setLateAfter(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ot">Overtime after (minutes)</Label>
            <Input
              id="ot"
              type="number"
              value={overtimeMin}
              onChange={(e) => setOvertimeMin(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="half">Half-day threshold (hours)</Label>
            <Input
              id="half"
              type="number"
              value={halfDay}
              onChange={(e) => setHalfDay(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="auto">Auto-checkout time (HH:mm)</Label>
            <Input
              id="auto"
              type="text"
              placeholder="18:30"
              value={autoCheckout}
              onChange={(e) => setAutoCheckout(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="free-late">Free late check-ins per month</Label>
            <Input
              id="free-late"
              type="number"
              min={0}
              value={freeLateDays}
              onChange={(e) => setFreeLateDays(Number(e.target.value))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Each late check-in beyond this quota deducts half a day's gross from payroll.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requirePhoto}
                onChange={(e) => setRequirePhoto(e.target.checked)}
              />
              <span className="text-sm">Require photo on check-in</span>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
