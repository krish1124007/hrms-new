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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import {
  useTodayAttendance,
  useCheckIn,
  useCheckOut,
  useMyAttendance,
} from '@/hooks/use-attendance';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '@/lib/dashboard.api';
import { type Attendance } from '@/lib/attendance.api';
import { payrollApi } from '@/lib/payroll.api';
import { expenseCategoriesApi, expenseClaimsApi } from '@/lib/expense-claims.api';
import { toast } from 'sonner';

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function fmtHours(h?: number): string {
  if (!h || h <= 0) return '0h 0m';
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  return `${hours}h ${mins}m`;
}

export default function EmployeeDashboardPage(): ReactElement {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const todayQ = useTodayAttendance();
  const checkIn = useCheckIn();
  const checkOut = useCheckOut();
  const qc = useQueryClient();

  // Expense-before-checkout modal state
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expCategory, setExpCategory] = useState<string>('');
  const [expAmount, setExpAmount] = useState<string>('');
  const [expDescription, setExpDescription] = useState<string>('');

  const categoriesQ = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => expenseCategoriesApi.list({ limit: 50 }),
    enabled: expenseOpen, // only fetch when the modal opens
  });
  const categories = categoriesQ.data?.data ?? [];
  // Default to "Daily expense" (code DAILY) when categories load
  const defaultCategoryId =
    categories.find((c) => c.code === 'DAILY')?._id ?? categories[0]?._id ?? '';

  const submitExpenseAndCheckOut = useMutation({
    mutationFn: async (): Promise<void> => {
      const today = new Date().toISOString();
      await expenseClaimsApi.create({
        category: expCategory || defaultCategoryId,
        amount: Number(expAmount),
        date: today,
        description: expDescription || "Today's expense",
        currency: 'INR',
        status: 'pending',
      });
      await new Promise<void>((resolve, reject) => {
        checkOut.mutate(
          { method: 'manual' },
          {
            onSuccess: () => resolve(),
            onError: (err) => reject(err),
          },
        );
      });
    },
    onSuccess: () => {
      setExpenseOpen(false);
      setExpAmount('');
      setExpDescription('');
      qc.invalidateQueries({ queryKey: ['attendance', 'today'] });
      qc.invalidateQueries({ queryKey: ['attendance', 'my'] });
      toast.success('Expense saved · Checked out');
    },
    onError: (err: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(err.response?.data?.error?.message ?? 'Could not check out');
    },
  });

  const handleCheckOutClick = (): void => {
    // Always open the expense modal — company policy is that every checkout
    // is preceded by today's expense entry. Backend enforces this anyway
    // (`EXPENSE_REQUIRED_FOR_CHECKOUT`), the modal makes it a one-click flow.
    setExpCategory(defaultCategoryId);
    setExpenseOpen(true);
  };

  // Pull this month's records to compute summary stats.
  const month = new Date();
  const monthStr = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
  const monthQ = useMyAttendance({ month: monthStr });
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
                  onClick={() => checkIn.mutate({ method: 'manual' })}
                  loading={checkIn.isPending}
                >
                  <LogIn className="size-4" /> Check in
                </Button>
              ) : checkedIn ? (
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={handleCheckOutClick}
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

      {/* This-month summary */}
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
                    {monthName(latestPayslip.month)} {latestPayslip.year}
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
            <CardTitle>This week</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <UpcomingSection
              title="Birthdays"
              icon={Cake}
              loading={upcoming.isLoading}
              empty="No birthdays in the next 7 days"
              items={(upcoming.data?.birthdays ?? []).map((b) => ({
                key: b._id,
                label: `${b.firstName} ${b.lastName}`,
                detail: new Date(b.dob).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                }),
              }))}
            />
            <UpcomingSection
              title="On leave"
              icon={CalendarOff}
              loading={upcoming.isLoading}
              empty="No leaves scheduled"
              items={(upcoming.data?.leaves ?? []).map((l) => ({
                key: l._id,
                label: l.employee
                  ? `${l.employee.firstName} ${l.employee.lastName}`
                  : 'Team member',
                detail: `${new Date(l.startDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })} → ${new Date(l.endDate).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                })}`,
              }))}
            />
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

      {/* Expense-before-checkout modal — opens whenever the employee clicks
          "Check out". Submitting the expense and the check-out happen as one
          atomic mutation so the user sees a single loading state. */}
      <Dialog
        open={expenseOpen}
        onClose={() => !submitExpenseAndCheckOut.isPending && setExpenseOpen(false)}
        size="md"
      >
        <DialogHeader>
          <DialogTitle>Submit today's expense to check out</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Company policy: every check-out requires today's expense entry.
            Fill it in below and click <span className="font-medium text-foreground">Submit & Check out</span>.
          </p>
          <div>
            <Label htmlFor="exp-category">Category *</Label>
            <Select
              id="exp-category"
              value={expCategory || defaultCategoryId}
              onChange={(e) => setExpCategory(e.target.value)}
              disabled={categoriesQ.isLoading}
            >
              {categoriesQ.isLoading ? (
                <option>Loading…</option>
              ) : categories.length === 0 ? (
                <option value="">No categories — ask HR to create one</option>
              ) : (
                categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))
              )}
            </Select>
          </div>
          <div>
            <Label htmlFor="exp-amount">Amount (₹) *</Label>
            <Input
              id="exp-amount"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={expAmount}
              onChange={(e) => setExpAmount(e.target.value)}
              placeholder="0"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="exp-description">Description</Label>
            <Input
              id="exp-description"
              value={expDescription}
              onChange={(e) => setExpDescription(e.target.value)}
              placeholder="What was this for?"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setExpenseOpen(false)}
            disabled={submitExpenseAndCheckOut.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => submitExpenseAndCheckOut.mutate()}
            loading={submitExpenseAndCheckOut.isPending}
            disabled={
              !expAmount ||
              Number(expAmount) <= 0 ||
              (!expCategory && !defaultCategoryId)
            }
          >
            <LogOut className="size-4" /> Submit & Check out
          </Button>
        </DialogFooter>
      </Dialog>
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
        <ul className="space-y-2">
          {items.slice(0, 4).map((i) => (
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
