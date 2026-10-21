/**
 * Employee dashboard — what a regular employee sees when they sign in.
 *
 * Layout (intentionally narrow scope):
 *   1. Big "today" card with clock-in / clock-out buttons + live timer.
 *   2. This-month summary  (present / absent / late days, hours worked).
 *   3. Leave balance, latest payslip, upcoming holidays.
 *   4. Quick links — apply leave, submit expense, my payslips, my profile.
 *
 * NOTHING admin-level appears here: no employee directory, no all-company
 * stats, no pending-approval queue, no audit feed.
 */

import { useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  Cake,
  CalendarOff,
  ClipboardList,
  Clock,
  FileText,
  IndianRupee,
  LogIn,
  LogOut,
  Receipt,
  TrendingUp,
  UserCheck,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/use-auth';
import {
  useTodayAttendance,
  useCheckIn,
  useCheckOut,
  useMyAttendance,
} from '@/hooks/use-attendance';
import { useMyLeaveBalances } from '@/hooks/use-leaves';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboard.api';
import { type Attendance, type CheckInPayload } from '@/lib/attendance.api';
import { payrollApi } from '@/lib/payroll.api';
import { noticesApi, type Notice } from '@/lib/notices.api';
import { useEffect } from 'react';
import { Megaphone } from 'lucide-react';
import { toast } from 'sonner';
import { LocationPermissionDialog } from '@/components/common/LocationPermissionDialog';
import { CheckoutExpenseDialog, isExpenseRequiredError } from '@/components/attendance/CheckoutExpenseDialog';
import { RichText } from '@/components/common/RichText';
import { monthBoundsIST, partsOfKey } from '@/lib/business-day';
import { formatDate, formatTime, todayIST } from '@/lib/format';

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return formatTime(iso);
}

/** `21 Oct` — a day of the year on the business (IST) calendar. */
const dayMonth = (d: string): string => formatDate(d, { year: undefined, month: 'short', day: 'numeric' });

function fmtHours(h?: number): string {
  if (!h || h <= 0) return '0h 0m';
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins}m`;
}

type LocationResult =
  | { ok: true; loc: { lat: number; lng: number } }
  | { ok: false; reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported' };

async function getLocation(): Promise<LocationResult> {
  if (!navigator.geolocation) return { ok: false, reason: 'unsupported' };
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, loc: { lat: pos.coords.latitude, lng: pos.coords.longitude } }),
      (err) =>
        resolve({
          ok: false,
          reason: err.code === err.PERMISSION_DENIED ? 'denied' : err.code === err.POSITION_UNAVAILABLE ? 'unavailable' : 'timeout',
        }),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 },
    );
  });
}

function isLocationRequiredError(e: unknown): boolean {
  const err = e as { response?: { data?: { error?: { code?: string } } } };
  return err.response?.data?.error?.code === 'LOCATION_REQUIRED';
}

const READ_LATER_KEY = 'opencore.notices.read-later';

/**
 * Notices this user put off with "Read later" in this browser session. Kept
 * in sessionStorage so the pop-up does not come back on every refetch or
 * reload, but does on their next visit.
 */
function readLaterIds(userId: string | undefined): string[] {
  if (!userId) return [];
  try {
    const raw = sessionStorage.getItem(`${READ_LATER_KEY}.${userId}`);
    const ids: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function rememberReadLater(userId: string | undefined, noticeId: string): void {
  if (!userId) return;
  try {
    const ids = new Set(readLaterIds(userId));
    ids.add(noticeId);
    sessionStorage.setItem(`${READ_LATER_KEY}.${userId}`, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable (private mode) — the notice may simply come back.
  }
}

export default function EmployeeDashboardPage(): ReactElement {
  const { user } = useAuth();
  // The business (IST) day, in the app's date style — not the browser's locale or timezone.
  const today = formatDate(new Date(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const todayQ = useTodayAttendance();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const qc = useQueryClient();

  // Today's expense form — opened only when a check-out answers
  // EXPENSE_REQUIRED_FOR_CHECKOUT (company policy `expenseBeforeCheckout`).
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [activeNotice, setActiveNotice] = useState<Notice | null>(null);

  const [locFailure, setLocFailure] = useState<{
    reason: 'denied' | 'unavailable' | 'timeout' | 'unsupported';
    kind: 'in' | 'out';
  } | null>(null);
  const [locRetrying, setLocRetrying] = useState(false);

  const noticesQ = useQuery({
    queryKey: ['notices', 'latest'],
    queryFn: () => noticesApi.list({ limit: 1 }),
  });

  useEffect(() => {
    const latest = noticesQ.data?.data?.[0];
    if (!latest) return;
    const acknowledged =
      latest.acknowledgedByMe ?? latest.acknowledgements?.some((a) => a.userId === user?._id) ?? false;
    if (!acknowledged && !readLaterIds(user?._id).includes(latest._id)) {
      setActiveNotice(latest);
    }
  }, [noticesQ.data, user?._id]);

  const readNoticeLater = (): void => {
    if (activeNotice) rememberReadLater(user?._id, activeNotice._id);
    setActiveNotice(null);
  };

  const acknowledgeNotice = useMutation({
    mutationFn: (id: string) => noticesApi.acknowledge(id),
    onSuccess: () => {
      setActiveNotice(null);
      qc.invalidateQueries({ queryKey: ['notices'] });
      toast.success('Notice acknowledged');
    },
  });

  /**
   * Check out straight away. Only if the server answers
   * EXPENSE_REQUIRED_FOR_CHECKOUT does today's expense form open; once the
   * claim is filed it calls this again. LOCATION_REQUIRED opens the
   * location help instead. Other errors are toasted by the global mutation handler.
   */
  const submitCheckOut = async (known?: { lat: number; lng: number }): Promise<void> => {
    const payload: CheckInPayload = { method: 'manual' };
    const res: LocationResult = known ? { ok: true, loc: known } : await getLocation();
    if (res.ok) payload.location = res.loc;
    try {
      await checkOut.mutateAsync(payload);
      setExpenseOpen(false);
    } catch (e: unknown) {
      if (isExpenseRequiredError(e)) {
        setExpenseOpen(true);
      } else if (isLocationRequiredError(e)) {
        setLocFailure({ reason: res.ok ? 'unavailable' : res.reason, kind: 'out' });
      }
    }
  };

  const submitCheckIn = async (): Promise<void> => {
    const payload: CheckInPayload = { method: 'manual' };
    const res = await getLocation();

    if (res.ok) {
      payload.location = res.loc;
    }

    try {
      await checkIn.mutateAsync(payload);
    } catch (e: unknown) {
      if (isLocationRequiredError(e)) {
        setLocFailure({ reason: res.ok ? 'unavailable' : res.reason, kind: 'in' });
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
    
    if (kind === 'in') {
      const payload: CheckInPayload = { method: 'manual', location: res.loc };
      checkIn.mutate(payload);
    } else {
      void submitCheckOut(res.loc);
    }
  };

  // Pull *this month's* records to compute summary stats. `month` alone used
  // to be dropped by the API, so the tiles below counted every record ever
  // recorded; `from`/`to` are sent alongside it so the range holds even
  // against an older backend. `limit` covers the longest month.
  // The IST calendar month — not the browser's: from 00:00 IST on the 1st to
  // the end of the last day, whatever timezone this browser is in.
  const { year: thisYear, month: thisMonth } = partsOfKey(todayIST());
  const monthStr = `${thisYear}-${String(thisMonth).padStart(2, '0')}`;
  const monthBounds = monthBoundsIST(thisYear, thisMonth);
  const monthQ = useMyAttendance({
    month: monthStr,
    from: monthBounds.from.toISOString(),
    to: monthBounds.to.toISOString(),
    limit: 31,
  });
  const records = (monthQ.data?.data ?? []) as Attendance[];

  // Upcoming holidays / birthdays / leaves for the next 7 days
  const upcoming = useQuery({
    queryKey: ['dashboard', 'upcoming'],
    queryFn: dashboardApi.upcoming,
  });

  // Latest payslip
  const payslips = useQuery({
    queryKey: ['payroll', 'my-payslips'],
    queryFn: () => payrollApi.myPayslips(),
  });

  // Leave balances
  const { data: balancesData, isLoading: loadingBalances } = useMyLeaveBalances(thisYear);
  const balances = balancesData?.data ?? [];

  const tdRec = todayQ.data?.data ?? null;
  const checkedIn = !!tdRec?.checkIn?.time && !tdRec?.checkOut?.time;
  const checkedOut = !!tdRec?.checkOut?.time;

  // This-month summary
  const summary = records.reduce(
    (acc, r) => {
      if (r.status === 'present' || r.status === 'late') acc.present += 1;
      if (r.status === 'late') acc.late += 1;
      if (r.status === 'absent') acc.absent += 1;
      if (r.status === 'half_day') acc.halfDay += 1;
      acc.totalHours += r.totalWorkingHours ?? 0;
      return acc;
    },
    { present: 0, late: 0, absent: 0, halfDay: 0, totalHours: 0 },
  );

  const latestPayslip = payslips.data?.data?.[0];

  return (
    <div className="space-y-6">
      <PageHeader title={`Welcome back, ${user?.firstName ?? 'there'}`} description={today} />

      {/* Clock in/out hero card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Clock className="size-4 text-muted-foreground" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Today
                </span>
                <Badge
                  variant={checkedOut ? 'success' : checkedIn ? 'default' : 'outline'}
                  className="capitalize"
                >
                  {checkedOut
                    ? 'Day complete'
                    : checkedIn
                      ? 'Working'
                      : 'Not checked in'}
                </Badge>
              </div>
              <div className="mt-3 flex flex-wrap items-baseline gap-x-8 gap-y-2">
                <Field label="Check-in" value={fmtTime(tdRec?.checkIn?.time)} mono />
                <Field label="Check-out" value={fmtTime(tdRec?.checkOut?.time)} mono />
                <Field
                  label="Hours"
                  value={fmtHours(tdRec?.totalWorkingHours)}
                  mono
                  highlight
                />
              </div>
              {tdRec?.lateBy && tdRec.lateBy > 0 ? (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Late by {tdRec.lateBy} min today
                </p>
              ) : null}
            </div>
            <div className="flex gap-2">
              {!checkedIn && !checkedOut ? (
                <Button
                  size="lg"
                  onClick={submitCheckIn}
                  loading={checkIn.isPending}
                >
                  <LogIn className="size-4" /> Check in
                </Button>
              ) : checkedIn ? (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={() => void submitCheckOut()}
                  loading={checkOut.isPending}
                >
                  <LogOut className="size-4" /> Check out
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">
                  See you tomorrow 👋
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* This-month summary — counts restart on the 1st; older months live
          in the attendance history. */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {formatDate(monthBounds.from, { month: 'long', year: 'numeric', day: undefined })}
        </h2>
        <Link to="/attendance/my" className="text-xs font-medium text-primary hover:underline">
          View history
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Present"
          value={monthQ.isLoading ? <InlineSkel /> : summary.present}
          icon={UserCheck}
        />
        <StatCard
          label="Late"
          value={monthQ.isLoading ? <InlineSkel /> : summary.late}
          icon={Clock}
        />
        <StatCard
          label="Absent"
          value={monthQ.isLoading ? <InlineSkel /> : summary.absent}
          icon={CalendarOff}
        />
        <StatCard
          label="Hours this month"
          value={monthQ.isLoading ? <InlineSkel /> : fmtHours(summary.totalHours)}
          icon={Activity}
        />
      </div>

      {/* Latest payslip + upcoming holidays */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Latest payslip</CardTitle>
            <Link to="/payroll/my-payslips" className="text-xs font-medium text-primary hover:underline">
              View all
            </Link>
          </CardHeader>
          <CardContent>
            {payslips.isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !latestPayslip ? (
              <p className="text-sm text-muted-foreground">
                No payslip available yet. It will appear here after the next payroll cycle is processed.
              </p>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {typeof latestPayslip.cycleId === 'object'
                      ? `${monthName(latestPayslip.cycleId.month)} ${latestPayslip.cycleId.year}`
                      : 'Latest'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Net pay
                  </p>
                </div>
                <div className="text-right">
                  <div className="flex items-baseline gap-1">
                    <IndianRupee className="size-4 text-primary" />
                    <span className="text-2xl font-bold tracking-tight">
                      {(latestPayslip.netSalary ?? 0).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Gross ₹{(latestPayslip.grossSalary ?? 0).toLocaleString('en-IN')}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Birthdays & leaves</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UpcomingSection
              title="Birthdays"
              icon={Cake}
              loading={upcoming.isLoading}
              empty="No employees with a date of birth on file"
              items={(upcoming.data?.birthdays ?? []).map((b) => ({
                key: b._id,
                label: `${b.firstName} ${b.lastName}`,
                detail: dayMonth(b.dob),
              }))}
            />
            <UpcomingSection
              title="On leave"
              icon={CalendarOff}
              loading={upcoming.isLoading}
              empty="No approved leaves right now or coming up"
              items={(upcoming.data?.leaves ?? []).map((l) => ({
                key: l._id,
                label: l.employee
                  ? `${l.employee.firstName} ${l.employee.lastName}`
                  : 'Team member',
                detail: `${dayMonth(l.startDate)} → ${dayMonth(l.endDate)}`,
              }))}
            />
          </CardContent>
        </Card>

        {/* Leave Balances */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Leave balances</CardTitle>
            <Link to="/leaves" className="text-xs font-medium text-primary hover:underline">
              Apply
            </Link>
          </CardHeader>
          <CardContent>
            {loadingBalances ? (
              <Skeleton className="h-24 w-full" />
            ) : balances.length === 0 ? (
              <p className="text-sm text-muted-foreground">No leave balances allocated yet.</p>
            ) : (
              <div className="space-y-3">
                {balances.slice(0, 3).map((b) => {
                  const lt = typeof b.leaveTypeId === 'object' ? b.leaveTypeId : null;
                  const total = (b.allocated ?? 0) + (b.carried ?? 0) + (b.adjusted ?? 0);
                  const remaining = total - (b.used ?? 0);
                  return (
                    <div key={b._id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: lt?.color ?? '#3b82f6' }}
                        />
                        <span className="text-sm font-medium">{lt?.name ?? 'Leave'}</span>
                      </div>
                      <span className="text-sm font-bold">{remaining} days</span>
                    </div>
                  );
                })}
                {balances.length > 3 && (
                  <p className="text-center text-[10px] text-muted-foreground italic">
                    + {balances.length - 3} more types
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links — only employee-level destinations */}
      <Card>
        <CardHeader>
          <CardTitle>Quick actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Link to="/leaves">
            <Button variant="outline" className="w-full justify-start">
              <ClipboardList className="size-4" /> Apply leave
            </Button>
          </Link>
          <Link to="/expense-claims">
            <Button variant="outline" className="w-full justify-start">
              <Receipt className="size-4" /> Submit expense
            </Button>
          </Link>
          <Link to="/payroll/my-payslips">
            <Button variant="outline" className="w-full justify-start">
              <FileText className="size-4" /> My payslips
            </Button>
          </Link>
          <Link to="/overtime">
            <Button variant="outline" className="w-full justify-start">
              <TrendingUp className="size-4" /> Overtime
            </Button>
          </Link>
        </CardContent>
      </Card>

      <CheckoutExpenseDialog
        open={expenseOpen}
        onClose={() => setExpenseOpen(false)}
        onFiled={() => void submitCheckOut()}
        checkingOut={checkOut.isPending}
      />

      <Dialog open={!!activeNotice} onClose={readNoticeLater} size="md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-full bg-primary/10 p-2 text-primary">
              <Megaphone className="size-5" />
            </div>
            <DialogTitle>{activeNotice?.title}</DialogTitle>
          </div>
        </DialogHeader>
        <DialogBody>
          {/* Rendered like the notice board: HTML notices as (sanitised) HTML. */}
          <RichText
            source={activeNotice?.content ?? ''}
            format="html"
            className="text-sm leading-relaxed text-muted-foreground"
          />
          {activeNotice?.attachments?.length ? (
            <div className="mt-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Attachments
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {activeNotice.attachments.map((file, idx) => (
                  <a
                    key={idx}
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 rounded-md border border-border p-2 text-xs hover:bg-accent"
                  >
                    <FileText className="size-3.5 text-primary" />
                    <span className="truncate font-medium">{file.name}</span>
                  </a>
                ))}
              </div>
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={readNoticeLater} disabled={acknowledgeNotice.isPending}>
            Read later
          </Button>
          <Button
            onClick={() => activeNotice && acknowledgeNotice.mutate(activeNotice._id)}
            loading={acknowledgeNotice.isPending}
          >
            Acknowledge
          </Button>
        </DialogFooter>
      </Dialog>

      <LocationPermissionDialog
        open={!!locFailure}
        reason={locFailure?.reason ?? 'unavailable'}
        onClose={() => setLocFailure(null)}
        onRetry={retryLocation}
        retrying={locRetrying}
      />
    </div>
  );
}

function Field({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}): ReactElement {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p
        className={`text-2xl font-bold ${mono ? 'tabular-nums' : ''} ${
          highlight ? 'text-primary' : 'text-foreground'
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function InlineSkel(): ReactElement {
  return <Skeleton className="inline-block h-6 w-12 align-middle" />;
}

function UpcomingSection({
  title,
  icon: Icon,
  loading,
  items,
  empty,
}: {
  title: string;
  icon: typeof Cake;
  loading: boolean;
  items: Array<{ key: string; label: string; detail: string }>;
  empty: string;
}): ReactElement {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="size-3.5" /> {title}
      </div>
      {loading ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground">{empty}</p>
      ) : (
        // Cap height + scroll so a long company list doesn't push the rest
        // of the dashboard off-screen, but everyone is reachable.
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {items.map((i) => (
            <li key={i.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{i.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{i.detail}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function monthName(m: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][
    Math.max(0, Math.min(11, m - 1))
  ];
}
