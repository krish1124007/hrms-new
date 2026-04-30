import { useMemo, useState, type ReactElement } from 'react';
import { Link } from 'react-router-dom';
import {
  Wallet,
  Users,
  TrendingDown,
  Banknote,
  Plus,
  Play,
  FileText,
  Lock,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
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
import {
  usePayrollCycles,
  useCreateCycle,
  useProcessCycle,
  useGeneratePayslips,
  useLockCycle,
  useMarkCyclePaid,
} from '@/hooks/use-payroll';
import type { PayrollCycle, PayrollCycleStatus } from '@/lib/payroll.api';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export function inr(amount: number): string {
  return `₹${Number(amount || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const STATUS_VARIANT: Record<
  PayrollCycleStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'outline'
> = {
  draft: 'outline',
  processing: 'warning',
  processed: 'secondary',
  paid: 'success',
  locked: 'destructive',
};

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

  const processMut = useProcessCycle();
  const generateMut = useGeneratePayslips();
  const lockMut = useLockCycle();
  const markPaidMut = useMarkCyclePaid();

  const [paidOpen, setPaidOpen] = useState<PayrollCycle | null>(null);
  const [paymentRef, setPaymentRef] = useState('');
  const submitPaid = (): void => {
    if (!paidOpen) return;
    markPaidMut.mutate(
      { id: paidOpen._id, paymentRef },
      {
        onSuccess: () => {
          setPaidOpen(null);
          setPaymentRef('');
        },
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
                      <td className="px-3 py-3 font-medium">
                        {MONTHS[c.month - 1]} {c.year}
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                      </td>
                      <td className="px-3 py-3 text-right">{c.employeeCount}</td>
                      <td className="px-3 py-3 text-right">{inr(c.totalGross)}</td>
                      <td className="px-3 py-3 text-right">{inr(c.totalDeductions)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{inr(c.totalNet)}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-1">
                          {c.status === 'draft' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => processMut.mutate(c._id)}
                              loading={processMut.isPending && processMut.variables === c._id}
                            >
                              <Play className="mr-1 size-3" />
                              Process
                            </Button>
                          )}
                          {c.status === 'processed' && !c.payslipGeneratedAt && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateMut.mutate(c._id)}
                              loading={generateMut.isPending && generateMut.variables === c._id}
                            >
                              <FileText className="mr-1 size-3" />
                              Payslips
                            </Button>
                          )}
                          {c.status === 'processed' && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setPaidOpen(c)}
                            >
                              <CheckCircle2 className="mr-1 size-3" />
                              Mark Paid
                            </Button>
                          )}
                          {(c.status === 'processed' || c.status === 'paid') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => lockMut.mutate(c._id)}
                              loading={lockMut.isPending && lockMut.variables === c._id}
                            >
                              <Lock className="mr-1 size-3" />
                              Lock
                            </Button>
                          )}
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
              {MONTHS.map((name, idx) => (
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

      <Dialog open={!!paidOpen} onClose={() => setPaidOpen(null)} size="md">
        <DialogHeader>
          <DialogTitle>Mark cycle as paid</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Records will be marked paid against the reference below.
          </p>
          <div>
            <Label htmlFor="ref">Payment reference *</Label>
            <Input
              id="ref"
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="UTR / NEFT / batch id"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaidOpen(null)}>
            Cancel
          </Button>
          <Button
            onClick={submitPaid}
            disabled={!paymentRef}
            loading={markPaidMut.isPending}
          >
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
