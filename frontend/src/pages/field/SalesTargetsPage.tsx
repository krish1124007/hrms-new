import { useMemo, useState, type ReactElement } from 'react';
import { Plus, Target, Trophy, TrendingUp, Trash2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useSalesTargets,
  useLeaderboard,
  useTeamSummary,
  useCreateTarget,
  useUpdateTarget,
  useDeleteTarget,
} from '@/hooks/use-field';
import { useEmployees } from '@/hooks/use-systemcore';
import type { SalesTarget, SalesTargetInput, TargetType } from '@/lib/field.api';

const inr = (n: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n || 0);

const monthNames = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function employeeName(
  e: SalesTarget['employeeId'],
): string {
  if (typeof e === 'object') return `${e.firstName} ${e.lastName}`;
  return '—';
}

export default function SalesTargetsPage(): ReactElement {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const { data: targetsData, isLoading } = useSalesTargets({ month, year });
  const { data: lbData } = useLeaderboard({ month, year });
  const { data: summary } = useTeamSummary({ month, year });
  const { data: empData } = useEmployees({ limit: 200 });
  const create = useCreateTarget();
  const update = useUpdateTarget();
  const remove = useDeleteTarget();

  const employees = empData?.data ?? [];
  const targets = targetsData?.data ?? [];
  const leaderboard = lbData?.data ?? [];
  const sum = summary?.data;

  const blank: SalesTargetInput = {
    employeeId: '',
    period: { month, year },
    type: 'amount',
    targetValue: 0,
  };

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SalesTargetInput>(blank);

  const startCreate = (): void => {
    setEditingId(null);
    setForm({ ...blank, period: { month, year } });
    setOpen(true);
  };

  const startEdit = (t: SalesTarget): void => {
    setEditingId(t._id);
    setForm({
      employeeId: typeof t.employeeId === 'object' ? t.employeeId._id : t.employeeId,
      period: { month: t.period.month, year: t.period.year },
      type: t.type,
      targetValue: t.targetValue,
      productCategory: t.productCategory,
    });
    setOpen(true);
  };

  const submit = (): void => {
    if (editingId) {
      update.mutate({ id: editingId, input: form }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(form, { onSuccess: () => setOpen(false) });
    }
  };

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1];
  }, [now]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Targets"
        description="Set monthly targets and track team performance"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Field Sales', to: '/field' },
          { label: 'Targets' },
        ]}
        actions={
          <Button onClick={startCreate}>
            <Plus className="mr-2 size-4" />
            New Target
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Select value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} className="w-32">
          {monthNames.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
        <Select value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Total Target"
          value={sum?.totalTarget ?? 0}
          format={inr}
          icon={Target}
        />
        <StatCard
          label="Total Achieved"
          value={sum?.totalAchieved ?? 0}
          format={inr}
          icon={TrendingUp}
        />
        <StatCard label="Achievement %" value={Math.round(sum?.percentage ?? 0)} icon={Trophy} />
        <StatCard label="Employees" value={sum?.employees ?? 0} icon={Target} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="size-4 text-warning" />
              Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent>
            {leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground">No targets yet</p>
            ) : (
              <ul className="space-y-3">
                {leaderboard.slice(0, 10).map((t, idx) => (
                  <li key={t._id} className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-bold">
                      {idx + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">{employeeName(t.employeeId)}</span>
                        <span className="font-semibold">{Math.round(t.percentage)}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className={
                            t.percentage >= 100
                              ? 'h-full bg-success'
                              : t.percentage >= 70
                                ? 'h-full bg-warning'
                                : 'h-full bg-destructive'
                          }
                          style={{ width: `${Math.min(100, t.percentage)}%` }}
                        />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {t.type === 'amount'
                          ? `${inr(t.achievedValue)} / ${inr(t.targetValue)}`
                          : `${t.achievedValue} / ${t.targetValue} ${t.type}`}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>All Targets</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : targets.length === 0 ? (
              <p className="text-sm text-muted-foreground">No targets yet</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {targets.map((t) => (
                  <li key={t._id} className="flex items-center justify-between gap-2 py-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{employeeName(t.employeeId)}</span>
                        <Badge
                          variant={
                            t.status === 'exceeded'
                              ? 'success'
                              : t.status === 'on_track'
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {t.status.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t.type} •{' '}
                        {t.type === 'amount'
                          ? `${inr(t.achievedValue)} / ${inr(t.targetValue)}`
                          : `${t.achievedValue} / ${t.targetValue}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => startEdit(t)}
                        className="rounded p-1.5 hover:bg-muted"
                      >
                        <Pencil className="size-4" />
                      </button>
                      <button
                        onClick={() => remove.mutate(t._id)}
                        className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editingId ? 'Edit target' : 'New target'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="emp">Employee *</Label>
            <Select
              id="emp"
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
            >
              <option value="">— Select employee —</option>
              {employees.map((e) => (
                <option key={e._id} value={e._id}>
                  {e.firstName} {e.lastName}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="month">Month</Label>
              <Select
                id="month"
                value={String(form.period.month)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    period: { ...form.period, month: Number(e.target.value) },
                  })
                }
              >
                {monthNames.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="year">Year</Label>
              <Select
                id="year"
                value={String(form.period.year)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    period: { ...form.period, year: Number(e.target.value) },
                  })
                }
              >
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="type">Type</Label>
              <Select
                id="type"
                value={form.type}
                onChange={(e) =>
                  setForm({ ...form, type: e.target.value as TargetType })
                }
              >
                <option value="amount">Amount (₹)</option>
                <option value="quantity">Quantity</option>
                <option value="visits">Visits</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="value">Target value *</Label>
              <Input
                id="value"
                type="number"
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: Number(e.target.value) })}
              />
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            loading={create.isPending || update.isPending}
            disabled={!form.employeeId || !form.targetValue}
          >
            {editingId ? 'Save' : 'Create'}
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
