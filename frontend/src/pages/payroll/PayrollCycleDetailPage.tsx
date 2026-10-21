import { useEffect, useRef, useState, type ReactElement } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Download, FileDown, Loader2, Pencil } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { CycleActions } from '@/components/payroll/CycleActions';
import { RecordAdjustmentsDialog } from '@/components/payroll/RecordAdjustmentsDialog';
import { usePayrollCycle, useCycleRecords } from '@/hooks/use-payroll';
import { ADJUSTABLE_FIELDS, type PayrollRecord } from '@/lib/payroll.api';
import {
  CYCLE_STATUS_VARIANT,
  canRunCycleAction,
  cyclePeriod,
  isStaleProcessing,
} from '@/lib/payroll-cycle';
import { inr } from './PayrollDashboardPage';
import { todayIST } from '@/lib/format';

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
  a.download = `payroll-records-${todayIST()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** HR has overridden at least one figure on this record. */
function isAdjusted(r: PayrollRecord): boolean {
  const manual = r.manualAdjustments;
  return !!manual && (ADJUSTABLE_FIELDS.some((f) => manual[f] != null) || !!manual.note);
}

/** A paid record whose loan instalments / expense claims have not been settled yet. */
function isUnsettled(r: PayrollRecord): boolean {
  const s = r.settlement;
  if (!s || s.settledAt) return false;
  return s.loanInstallments.length > 0 || s.claimIds.length > 0;
}

export default function PayrollCycleDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const { data: cycleData } = usePayrollCycle(id);
  const { data: recordsData, isLoading, error: recordsError, refetch: refetchRecords } = useCycleRecords(id);
  const cycle = cycleData?.data;
  const records = recordsData?.data ?? [];

  const [editing, setEditing] = useState<PayrollRecord | null>(null);

  // A run that finishes while the page is open rebuilt the records: reload
  // them when the status moves on (not on the first load).
  const status = cycle?.status;
  const previousStatus = useRef(status);
  useEffect(() => {
    if (previousStatus.current && status && previousStatus.current !== status) void refetchRecords();
    previousStatus.current = status;
  }, [status, refetchRecords]);

  const editable = cycle ? canRunCycleAction(cycle, 'edit') : false;
  const unsettled = cycle?.status === 'paid' && records.some(isUnsettled);

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
      cell: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="font-semibold">{inr(r.netSalary)}</span>
          {isAdjusted(r) && (
            <Badge variant="warning" title={r.manualAdjustments?.note || 'HR adjusted this record'}>
              adjusted
            </Badge>
          )}
        </div>
      ),
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
            type="button"
            onClick={() => setEditing(r)}
            className="rounded p-1.5 hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!editable}
            aria-label="Edit adjustments"
            title={editable || !cycle ? 'Edit adjustments' : `A ${cycle.status} cycle cannot be adjusted`}
          >
            <Pencil className="size-4" />
          </button>
          {r.payslipUrl && (
            <a
              href={r.payslipUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1.5 text-primary hover:bg-primary/10"
              aria-label="Payslip"
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
        title={cycle ? `${cyclePeriod(cycle)} payroll` : 'Payroll cycle'}
        titleAddon={
          cycle ? (
            <Badge variant={CYCLE_STATUS_VARIANT[cycle.status]} data-testid="cycle-status">
              {cycle.status}
            </Badge>
          ) : undefined
        }
        description={cycle ? `${cycle.employeeCount} employees` : undefined}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Payroll', to: '/payroll' },
          { label: 'Cycle' },
        ]}
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {cycle && <CycleActions cycle={cycle} layout="header" />}
            <Button variant="outline" onClick={() => exportCSV(records)}>
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        }
      />

      {cycle?.status === 'processing' && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          {isStaleProcessing(cycle) ? (
            <>
              <AlertTriangle className="size-4" />
              The last processing run stopped part-way. Process the cycle again to rebuild its records.
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" />
              Processing — the records are being rebuilt. This page refreshes when the run finishes.
            </>
          )}
        </div>
      )}

      {unsettled && (
        <div className="flex items-center gap-2 rounded-md border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <AlertTriangle className="size-4" />
          Some loan instalments or expense claims this cycle paid are not settled yet. Use “Retry
          settlement”.
        </div>
      )}

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
        error={recordsError}
        onRetry={() => void refetchRecords()}
        rowKey={(r) => r._id}
        emptyTitle="No records"
        emptyDescription="Process the payroll cycle to generate records."
      />

      {cycle && (
        <RecordAdjustmentsDialog record={editing} cycle={cycle} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
