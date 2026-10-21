import { useMemo, useState, type ReactElement } from 'react';
import { Pencil, Plus, Target, Trash2, TrendingUp, Trophy, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Dialog, DialogBody, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import {
  useCanManageField,
  useCreateTarget,
  useDeleteTarget,
  useFieldReps,
  useLeaderboard,
  useProductCategories,
  useSalesTargets,
  useTeamSummary,
  useUpdateTarget,
} from '@/hooks/use-field';
import { usePermissions } from '@/hooks/use-permissions';
import { apiErrorMessage, isNoEmployeeProfileError } from '@/lib/api-error';
import { partsOfKey } from '@/lib/business-day';
import { personName, refId, type SalesTarget, type SalesTargetInput, type TargetType } from '@/lib/field.api';
import { formatCurrency, todayIST } from '@/lib/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const TYPE_LABEL: Record<TargetType, string> = { amount: 'Sales (₹)', quantity: 'Quantity', visits: 'Visits' };

const fmtValue = (type: TargetType, n: number): string =>
  type === 'amount' ? formatCurrency(n, { compact: n >= 100000 }) : n.toLocaleString('en-IN');

const STATUS_BADGE = {
  exceeded: { variant: 'success', label: 'Exceeded' },
  on_track: { variant: 'warning', label: 'On track' },
  behind: { variant: 'destructive', label: 'Behind' },
} as const;

function Progress({ pct }: { pct: number }): ReactElement {
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
      <div
        className={pct >= 100 ? 'h-full bg-success' : pct >= 70 ? 'h-full bg-warning' : 'h-full bg-destructive'}
        style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
      />
    </div>
  );
}

interface FormState {
  employeeId: string;
  month: number;
  year: number;
  type: TargetType;
  productCategory: string;
  targetValue: string;
}

export default function SalesTargetsPage(): ReactElement {
  const canManage = useCanManageField();
  const { has } = usePermissions();
  const { year: thisYear, month: thisMonth } = partsOfKey(todayIST());
  const [month, setMonth] = useState(thisMonth);
  const [year, setYear] = useState(thisYear);
  const [type, setType] = useState<TargetType>('amount');

  const { data: targetsData, isLoading, error } = useSalesTargets({ month, year, limit: 100 });
  const { data: lbData } = useLeaderboard({ month, year, type });
  const { data: summary } = useTeamSummary({ month, year, type });
  const { data: reps = [] } = useFieldReps(canManage && has('employees.view'));
  const { data: catData } = useProductCategories();
  const categories = catData?.data ?? [];
  const create = useCreateTarget();
  const update = useUpdateTarget();
  const remove = useDeleteTarget();

  const targets = targetsData?.data ?? [];
  const leaderboard = lbData?.data ?? [];
  const sum = summary?.data;
  const years = useMemo(() => [thisYear - 1, thisYear, thisYear + 1], [thisYear]);

  const blank = (): FormState => ({ employeeId: '', month, year, type: 'amount', productCategory: '', targetValue: '' });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SalesTarget | null>(null);
  const [form, setForm] = useState<FormState>(blank);
  const [deleting, setDeleting] = useState<SalesTarget | null>(null);

  const startCreate = (): void => {
    setEditing(null);
    setForm(blank());
    setOpen(true);
  };
  const startEdit = (t: SalesTarget): void => {
    setEditing(t);
    setForm({
      employeeId: refId(t.employeeId),
      month: t.period.month,
      year: t.period.year,
      type: t.type,
      productCategory: t.productCategory ?? '',
      targetValue: String(t.targetValue),
    });
    setOpen(true);
  };

  const value = Number(form.targetValue);
  const valid = !!form.employeeId && Number.isFinite(value) && value > 0;

  const submit = (): void => {
    if (!valid) return;
    const body: Omit<SalesTargetInput, 'employeeId'> = {
      period: { month: form.month, year: form.year },
      type: form.type,
      productCategory: form.type !== 'visits' && form.productCategory ? form.productCategory : undefined,
      targetValue: value,
    };
    if (editing) update.mutate({ id: editing._id, input: body }, { onSuccess: () => setOpen(false) });
    else create.mutate({ ...body, employeeId: form.employeeId }, { onSuccess: () => setOpen(false) });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Targets"
        description="Monthly targets; achievement is counted live from confirmed and delivered orders and completed visits"
        icon={Target}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Targets' }]}
        actions={
          canManage ? (
            <Button onClick={startCreate}>
              <Plus className="mr-2 size-4" />
              New target
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Select aria-label="Month" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} className="w-28">
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </Select>
        <Select aria-label="Year" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} className="w-28">
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </Select>
        <Select aria-label="Target type" value={type} onChange={(e) => setType(e.target.value as TargetType)} className="w-36">
          {(Object.keys(TYPE_LABEL) as TargetType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total target" value={sum ? fmtValue(type, sum.totalTarget) : '—'} icon={Target} />
        <StatCard label="Achieved" value={sum ? fmtValue(type, sum.totalAchieved) : '—'} icon={TrendingUp} />
        <StatCard label="Achievement" value={sum ? `${Math.round(sum.percentage)}%` : '—'} icon={Trophy} />
        <StatCard label="Reps with a target" value={sum?.employees ?? 0} icon={Users} />
      </div>

      {isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="targets" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="size-4 text-warning" />
                Leaderboard — {TYPE_LABEL[type]}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-sm text-muted-foreground">No {TYPE_LABEL[type].toLowerCase()} targets for this month.</p>
              ) : (
                <ul className="space-y-3">
                  {leaderboard.slice(0, 10).map((t, idx) => (
                    <li key={t._id} className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold">
                        {idx + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-sm">
                          <span className="truncate font-medium">{personName(t.employeeId)}</span>
                          <span className="font-semibold">{Math.round(t.percentage)}%</span>
                        </div>
                        <Progress pct={t.percentage} />
                        <div className="mt-1 text-xs text-muted-foreground">
                          {fmtValue(t.type, t.achievedValue)} / {fmtValue(t.type, t.targetValue)}
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
              <CardTitle>
                Targets — {MONTHS[month - 1]} {year}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : error ? (
                <p className="text-sm text-destructive">{apiErrorMessage(error)}</p>
              ) : targets.length === 0 ? (
                <p className="text-sm text-muted-foreground">No targets for this month.</p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {targets.map((t) => {
                    const badge = STATUS_BADGE[t.status] ?? STATUS_BADGE.behind;
                    return (
                      <li key={t._id} className="flex items-center justify-between gap-2 py-3 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{personName(t.employeeId)}</span>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {TYPE_LABEL[t.type]}
                            {t.productCategory ? ` · ${t.productCategory}` : ''} · {fmtValue(t.type, t.achievedValue)} /{' '}
                            {fmtValue(t.type, t.targetValue)} ({Math.round(t.percentage)}%)
                          </div>
                          <Progress pct={t.percentage} />
                          {t.milestones?.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {t.milestones.map((m, i) => (
                                <Badge key={i} variant={m.achieved ? 'success' : 'outline'} className="text-[10px]">
                                  {fmtValue(t.type, m.value)}
                                  {m.reward ? ` · ${m.reward}` : ''}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                        {canManage && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => startEdit(t)} className="rounded p-1.5 hover:bg-muted" aria-label="Edit target">
                              <Pencil className="size-4" />
                            </button>
                            <button
                              onClick={() => setDeleting(t)}
                              className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                              aria-label="Delete target"
                            >
                              <Trash2 className="size-4" />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit target' : 'New target'}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="t-emp">Rep *</Label>
            {editing ? (
              <div id="t-emp" className="flex h-10 items-center rounded-md border border-input px-3 text-sm">
                {personName(editing.employeeId)}
              </div>
            ) : (
              <Select id="t-emp" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">— Select a rep —</option>
                {reps.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.firstName} {e.lastName}
                    {e.employeeId ? ` (${e.employeeId})` : ''}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="t-month">Month</Label>
              <Select id="t-month" value={String(form.month)} onChange={(e) => setForm({ ...form, month: Number(e.target.value) })}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-year">Year</Label>
              <Select id="t-year" value={String(form.year)} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}>
                {years.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-type">Type</Label>
              <Select id="t-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as TargetType })}>
                {(Object.keys(TYPE_LABEL) as TargetType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="t-value">Target *</Label>
              <Input
                id="t-value"
                type="number"
                min={0}
                value={form.targetValue}
                onChange={(e) => setForm({ ...form, targetValue: e.target.value })}
              />
            </div>
          </div>
          {form.type !== 'visits' && (
            <div className="space-y-1.5">
              <Label htmlFor="t-cat">Product category</Label>
              <Select id="t-cat" value={form.productCategory} onChange={(e) => setForm({ ...form, productCategory: e.target.value })}>
                <option value="">All products</option>
                {form.productCategory && !categories.includes(form.productCategory) && (
                  <option value={form.productCategory}>{form.productCategory}</option>
                )}
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {form.type === 'visits'
              ? 'Counts completed visits checked in during the month.'
              : 'Counts the rep’s confirmed and delivered orders placed during the month.'}
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid} loading={create.isPending || update.isPending}>
            {editing ? 'Save' : 'Set target'}
          </Button>
        </DialogFooter>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting._id, { onSuccess: () => setDeleting(null) })}
        loading={remove.isPending}
        title={`Delete ${deleting ? personName(deleting.employeeId) : ''}'s target?`}
        description="The target disappears from the leaderboard and summaries. The orders and visits it counted are not affected."
        confirmLabel="Delete target"
      />
    </div>
  );
}
