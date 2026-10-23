import { useEffect, useState, type ReactElement } from 'react';
import { Save } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAttendanceConfig, useUpdateAttendanceConfig } from '@/hooks/use-attendance';
import type { AttendanceMethod, ExpenseBeforeCheckout } from '@/lib/attendance.api';
import {
  DAY_NAMES,
  DEFAULT_WEEK_OFF_RULE,
  WEEK_LABELS,
  describeWeekOff,
  type WeekOffRule,
} from '@/lib/week-off';
import { cn } from '@/lib/utils';

/** How a single weekday is treated. */
type DayMode = 'working' | 'off' | 'alternate';

const WEEK_NUMBERS = [1, 2, 3, 4, 5];

// Face recognition is no longer offered; a stored `face` is dropped on the next save.
const ALL_METHODS: { key: AttendanceMethod; label: string; desc: string }[] = [
  { key: 'manual', label: 'Manual', desc: 'Admin/HR records attendance manually' },
  { key: 'qr', label: 'Static QR', desc: 'Scan a fixed QR posted at the office' },
  { key: 'dynamic_qr', label: 'Dynamic QR', desc: 'Rotating QR shown on a screen' },
  { key: 'ip', label: 'Office IP', desc: 'Only allow check-in from approved IPs' },
  { key: 'site', label: 'Site GPS', desc: 'GPS distance from office site' },
  { key: 'geofence', label: 'Geofence', desc: 'Polygon or circle perimeter' },
  { key: 'device', label: 'Device', desc: 'Bound to a specific device ID' },
];

const OFFERED_METHODS = new Set(ALL_METHODS.map((m) => m.key));

const EXPENSE_RULES: { value: ExpenseBeforeCheckout; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'field', label: 'Field staff only' },
  { value: 'none', label: 'No one' },
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
  const [requireLocation, setRequireLocation] = useState(false);
  // Not edited here (nothing enforces it yet) — kept as stored, since a save replaces all settings.
  const [requireNoteOnLate, setRequireNoteOnLate] = useState(false);
  const [expenseRule, setExpenseRule] = useState<ExpenseBeforeCheckout>('all');
  const [freeLateDays, setFreeLateDays] = useState(3);
  const [weekOff, setWeekOff] = useState<WeekOffRule>(DEFAULT_WEEK_OFF_RULE);

  useEffect(() => {
    if (data?.data) {
      const c = data.data;
      setEnabled(c.enabledMethods.filter((m) => OFFERED_METHODS.has(m)));
      setLateAfter(c.settings.lateMarkAfterMinutes ?? 15);
      setOvertimeMin(c.settings.overtimeThresholdMinutes ?? 540);
      setHalfDay(c.settings.halfDayThresholdHours ?? 4);
      setAutoCheckout(c.settings.autoCheckoutTime ?? '');
      setRequirePhoto(c.settings.requirePhotoOnCheckIn ?? false);
      setRequireLocation(c.settings.requireLocation ?? false);
      setRequireNoteOnLate(c.settings.requireNoteOnLateCheckIn ?? false);
      setExpenseRule(c.settings.expenseBeforeCheckout ?? 'all');
      setFreeLateDays(c.settings.freeLateDaysPerMonth ?? 3);
      setWeekOff({
        fullDaysOff: c.weekOff?.fullDaysOff ?? DEFAULT_WEEK_OFF_RULE.fullDaysOff,
        partialDaysOff: c.weekOff?.partialDaysOff ?? DEFAULT_WEEK_OFF_RULE.partialDaysOff,
      });
    }
  }, [data]);

  const toggle = (m: AttendanceMethod): void => {
    setEnabled((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  };

  const dayMode = (day: number): DayMode => {
    if (weekOff.fullDaysOff.includes(day)) return 'off';
    const partial = weekOff.partialDaysOff.find((p) => p.day === day);
    return partial && partial.weeks.length > 0 ? 'alternate' : 'working';
  };

  /** Move a weekday between working / off-every-week / off-on-selected-weeks. */
  const setDayMode = (day: number, mode: DayMode): void => {
    setWeekOff((prev) => {
      const fullDaysOff = prev.fullDaysOff.filter((d) => d !== day);
      const partialDaysOff = prev.partialDaysOff.filter((p) => p.day !== day);
      if (mode === 'off') fullDaysOff.push(day);
      // Seed "alternate" with the 2nd and 4th — the common Indian pattern.
      // The admin can change the ticks straight away.
      if (mode === 'alternate') partialDaysOff.push({ day, weeks: [2, 4] });
      return {
        fullDaysOff: fullDaysOff.sort((a, b) => a - b),
        partialDaysOff: partialDaysOff.sort((a, b) => a.day - b.day),
      };
    });
  };

  /** Tick / untick one occurrence (1st, 2nd, …) for an alternate-off weekday. */
  const toggleWeek = (day: number, week: number): void => {
    setWeekOff((prev) => ({
      ...prev,
      partialDaysOff: prev.partialDaysOff.map((p) =>
        p.day === day
          ? {
              ...p,
              weeks: p.weeks.includes(week)
                ? p.weeks.filter((w) => w !== week)
                : [...p.weeks, week].sort((a, b) => a - b),
            }
          : p,
      ),
    }));
  };

  const autoCheckoutValid = autoCheckout === '' || /^\d{2}:\d{2}$/.test(autoCheckout);

  const save = (): void => {
    if (!autoCheckoutValid) return;
    // The API replaces the whole `settings` object, so every field is sent.
    updateMutation.mutate({
      enabledMethods: enabled.length ? enabled : ['manual'],
      settings: {
        lateMarkAfterMinutes: lateAfter,
        overtimeThresholdMinutes: overtimeMin,
        halfDayThresholdHours: halfDay,
        autoCheckoutTime: autoCheckout || undefined,
        requirePhotoOnCheckIn: requirePhoto,
        requireLocation: requireLocation,
        requireNoteOnLateCheckIn: requireNoteOnLate,
        freeLateDaysPerMonth: freeLateDays,
        expenseBeforeCheckout: expenseRule,
      },
      weekOff: {
        fullDaysOff: weekOff.fullDaysOff,
        // A weekday with no ticked occurrences is just a working day — don't
        // persist an empty rule for it.
        partialDaysOff: weekOff.partialDaysOff.filter((p) => p.weeks.length > 0),
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
          <Button onClick={save} loading={updateMutation.isPending} disabled={!autoCheckoutValid}>
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
          <CardTitle>Week off</CardTitle>
          <p className="text-xs text-muted-foreground">
            Pick which days the company works. Choose <strong>Selected weeks</strong> for a day
            that is only off some weeks — like the 2nd and 4th Saturday.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {DAY_NAMES.map((name, day) => {
            const mode = dayMode(day);
            const partial = weekOff.partialDaysOff.find((p) => p.day === day);
            return (
              <div
                key={name}
                className="flex flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="w-24 font-medium">{name}</span>
                  <div className="flex flex-wrap gap-1">
                    {(
                      [
                        { key: 'working', label: 'Working day' },
                        { key: 'off', label: 'Off every week' },
                        { key: 'alternate', label: 'Selected weeks' },
                      ] as { key: DayMode; label: string }[]
                    ).map((opt) => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setDayMode(day, opt.key)}
                        aria-pressed={mode === opt.key}
                        className={cn(
                          'rounded-md border px-2.5 py-1 text-xs transition-colors',
                          mode === opt.key
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:bg-muted',
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {mode === 'alternate' && (
                  <div className="flex items-center gap-2 sm:pl-0">
                    <span className="text-xs text-muted-foreground">Off on:</span>
                    {WEEK_NUMBERS.map((w) => {
                      const on = partial?.weeks.includes(w) ?? false;
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => toggleWeek(day, w)}
                          aria-pressed={on}
                          className={cn(
                            'size-8 rounded-md border text-xs transition-colors',
                            on
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-input hover:bg-muted',
                          )}
                        >
                          {WEEK_LABELS[w]}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            Current rule: {describeWeekOff(weekOff)}. This drives the attendance calendars,
            leave-day counting and the shift roster on both web and mobile.
          </p>
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
            <Label htmlFor="auto">Auto-checkout time</Label>
            <Input
              id="auto"
              type="time"
              value={autoCheckout}
              onChange={(e) => setAutoCheckout(e.target.value.slice(0, 5))}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The nightly close checks out anyone still clocked in at this time (23:59 when blank).
              An auto check-out never counts as overtime.
            </p>
          </div>
          <div>
            <Label htmlFor="expense-rule">Expenses before check-out</Label>
            <Select
              id="expense-rule"
              value={expenseRule}
              onChange={(e) => setExpenseRule(e.target.value as ExpenseBeforeCheckout)}
            >
              {EXPENSE_RULES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Who must file the day's expenses before they can check out. Mark field staff on the
              employee's profile.
            </p>
          </div>
          <div>
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
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requireLocation}
                onChange={(e) => setRequireLocation(e.target.checked)}
              />
              <span className="text-sm">Require location on check-in & check-out</span>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
