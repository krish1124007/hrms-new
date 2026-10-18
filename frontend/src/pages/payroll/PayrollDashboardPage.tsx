import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { Wallet, Users, TrendingDown, Banknote, Plus, ArrowRight } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { CycleActions } from '@/components/payroll/CycleActions';
import { usePayrollCycles, useCreateCycle } from '@/hooks/use-payroll';
import { CYCLE_STATUS_VARIANT, MONTH_NAMES, cyclePeriod } from '@/lib/payroll-cycle';

export function inr(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function PayrollDashboardPage(): ReactElement {
  const { data, isLoading } = usePayrollCycles({ limit: 12 });
  const cycles = data?.data ?? [];
  const current = cycles[0] ?? null;

  const totals = useMemo(() => {
    return {
      gross: cycles.reduce((s, c) => s + (c.totalGross || 0), 0),
      deductions: cycles.reduce((s, c) => s + (c.totalDeductions || 0), 0),
      net: cycles.reduce((s, c) => s + (c.totalNet || 0), 0),
      employees: current?.employeeCount ?? 0,
    };
  }, [cycles, current]);

  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());
  const createMut = useCreateCycle();

  const submitCreate = (): void => {
    createMut.mutate(
      { month, year },
      {
        onSuccess: () => setCreateOpen(false),
      },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payroll"
        description="Process monthly payroll, generate payslips and manage statutory filings"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Payroll' }]}
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" />
            New Cycle
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Latest Gross"
          value={current?.totalGross ?? 0}
          icon={Wallet}
          format={inr}
        />
        <StatCard
          label="Latest Deductions"
          value={current?.totalDeductions ?? 0}
          icon={TrendingDown}
          format={inr}
        />
        <StatCard
          label="Latest Net"
          value={current?.totalNet ?? 0}
          icon={Banknote}
          format={inr}
        />
        <StatCard label="Employees" value={totals.employees} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll cycles</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : cycles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No cycles yet. Create one to get started.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Period</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Employees</th>
                    <th className="px-3 py-2 text-right">Gross</th>
                    <th className="px-3 py-2 text-right">Deductions</th>
                    <th className="px-3 py-2 text-right">Net</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.map((c) => (
                    <tr key={c._id} className="border-b border-border/60">
                      <td className="px-3 py-3 font-medium">{cyclePeriod(c)}</td>
                      <td className="px-3 py-3">
                        <Badge variant={CYCLE_STATUS_VARIANT[c.status]}>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right">{c.employeeCount}</td>
                      <td className="px-3 py-3 text-right">{inr(c.totalGross)}</td>
                      <td className="px-3 py-3 text-right">{inr(c.totalDeductions)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{inr(c.totalNet)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          <CycleActions cycle={c} layout="row" />
                          <Link
                            to={`/payroll/cycles/${c._id}`}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-border px-2 text-xs hover:bg-muted"
                          >
                            <ArrowRight className="size-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Create payroll cycle</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="m">Month</Label>
            <Select
              id="m"
              value={String(month)}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {MONTH_NAMES.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="y">Year</Label>
            <Input
              id="y"
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitCreate} loading={createMut.isPending}>
            Create
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
