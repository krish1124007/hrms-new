import { useState, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { Download, Pencil, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  usePayrollCycle,
  useCycleRecords,
  useUpdateCycleRecord,
} from '@/hooks/use-payroll';
import type { PayrollRecord } from '@/lib/payroll.api';
import { inr } from './PayrollDashboardPage';

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

function exportCSV(rows: PayrollRecord[]): void {
  const headers = [
    'Employee',
    'Employee ID',
    'Working Days',
    'Present',
    'LOP',
    'Gross',
    'Deductions',
    'Net',
    'Status',
  ];
  const lines = rows.map((r) => {
    const emp =
      typeof r.employeeId === 'object'
        ? `${r.employeeId.firstName} ${r.employeeId.lastName}`
        : '';
    const empId = typeof r.employeeId === 'object' ? r.employeeId.employeeId ?? '' : '';
    return [
      emp,
      empId,
      r.workingDays,
      r.presentDays,
      r.lopDays,
      r.grossSalary,
      r.totalDeductions,
      r.netSalary,
      r.paymentStatus,
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(',');
  });
  const csv = [headers.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `payroll-records-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PayrollCycleDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data: cycleData } = usePayrollCycle(id);
  const { data: recordsData, isLoading } = useCycleRecords(id);
  const cycle = cycleData?.data;
  const records = recordsData?.data ?? [];

  const [editing, setEditing] = useState<PayrollRecord | null>(null);
  const [arrears, setArrears] = useState(0);
  const [reimbursements, setReimbursements] = useState(0);
  const [loanDeduction, setLoanDeduction] = useState(0);
  const [overtimeAmount, setOvertimeAmount] = useState(0);

  const updateMut = useUpdateCycleRecord();

  const openEdit = (r: PayrollRecord): void => {
    setEditing(r);
    setArrears(r.arrears);
    setReimbursements(r.reimbursements);
    setLoanDeduction(r.loanDeduction);
    setOvertimeAmount(r.overtimeAmount);
  };

  const submitEdit = (): void => {
    if (!editing || !id) return;
    updateMut.mutate(
      {
        cycleId: id,
        recordId: editing._id,
        input: { arrears, reimbursements, loanDeduction, overtimeAmount },
      },
      { onSuccess: () => setEditing(null) },
    );
  };

  const totals = records.reduce(
    (acc, r) => ({
      gross: acc.gross + r.grossSalary,
      deductions: acc.deductions + r.totalDeductions,
      net: acc.net + r.netSalary,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  const columns: DataTableColumn<PayrollRecord>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (r) => {
        const emp = typeof r.employeeId === 'object' ? r.employeeId : null;
        return emp ? (
          <div>
            <div className="font-medium">{`${emp.firstName} ${emp.lastName}`}</div>
            <div className="text-xs text-muted-foreground">{emp.employeeId}</div>
          </div>
        ) : (
          '—'
        );
      },
    },
    {
      key: 'attendance',
      header: 'Attendance',
      cell: (r) => (
        <span className="text-xs">
          {r.presentDays}/{r.workingDays}
          {r.lopDays > 0 && <span className="text-destructive"> · LOP {r.lopDays}</span>}
        </span>
      ),
    },
    { key: 'gross', header: 'Gross', cell: (r) => inr(r.grossSalary) },
    {
      key: 'ded',
      header: 'Deductions',
      cell: (r) => <span className="text-destructive">{inr(r.totalDeductions)}</span>,
    },
    {
      key: 'net',
      header: 'Net',
      cell: (r) => <span className="font-semibold">{inr(r.netSalary)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (r) => (
        <Badge variant={r.paymentStatus === 'paid' ? 'success' : 'outline'}>
          {r.paymentStatus}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <button
            onClick={() => openEdit(r)}
            className="rounded p-1.5 hover:bg-muted"
            disabled={cycle?.status === 'locked' || cycle?.status === 'paid'}
          >
            <Pencil className="size-4" />
          </button>
          {r.payslipUrl && (
            <a
              href={r.payslipUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1.5 text-primary hover:bg-primary/10"
            >
              <FileDown className="size-4" />
            </a>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={cycle ? `${MONTHS[cycle.month - 1]} ${cycle.year} payroll` : 'Payroll cycle'}
        description={
          cycle ? `${cycle.employeeCount} employees · ${cycle.status}` : undefined
        }
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Payroll', to: '/payroll' },
          { label: 'Cycle' },
        ]}
        actions={
          <Button variant="outline" onClick={() => exportCSV(records)}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Gross
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold">{inr(totals.gross)}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Deductions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-destructive">
            {inr(totals.deductions)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Net
            </CardTitle>
          </CardHeader>
          <CardContent className="text-2xl font-bold text-primary">
            {inr(totals.net)}
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={records}
        loading={isLoading}
        rowKey={(r) => r._id}
        emptyTitle="No records"
        emptyDescription="Process the payroll cycle to generate records."
      />

      <Dialog open={!!editing} onClose={() => setEditing(null)} size="md">
        <DialogHeader>
          <DialogTitle>Adjust record</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor="ar">Arrears</Label>
            <Input
              id="ar"
              type="number"
              value={arrears}
              onChange={(e) => setArrears(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="re">Reimbursements</Label>
            <Input
              id="re"
              type="number"
              value={reimbursements}
              onChange={(e) => setReimbursements(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ot">Overtime amount</Label>
            <Input
              id="ot"
              type="number"
              value={overtimeAmount}
              onChange={(e) => setOvertimeAmount(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor="ld">Loan EMI deduction</Label>
            <Input
              id="ld"
              type="number"
              value={loanDeduction}
              onChange={(e) => setLoanDeduction(Number(e.target.value))}
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(null)}>
            Cancel
          </Button>
          <Button onClick={submitEdit} loading={updateMut.isPending}>
            Save
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
