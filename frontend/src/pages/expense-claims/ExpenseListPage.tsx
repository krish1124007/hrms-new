import { useState, type ReactElement } from 'react';
import { Check, X, Wallet, Download } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useExpenseClaims,
  useApproveExpenseClaim,
  useRejectExpenseClaim,
  useReimburseExpenseClaim,
} from '@/hooks/use-expense-claims';
import {
  expenseClaimsApi,
  type ExpenseClaim,
  type ExpenseClaimStatus,
} from '@/lib/expense-claims.api';

function buildCSV(rows: ExpenseClaim[]): string {
  const headers = [
    'Employee',
    'Category',
    'Date',
    'Amount',
    'Currency',
    'Description',
    'Payment Method',
    'Status',
    'Approved By',
    'Approved At',
    'Rejected Reason',
    'Reimbursed At',
    'Reimbursement Ref',
    'Submitted At',
  ];
  const lines = rows.map((c) => {
    const emp = typeof c.employeeId === 'object' ? c.employeeId : null;
    const cat = typeof c.category === 'object' ? c.category : null;
    const approver = typeof c.approvedBy === 'object' ? c.approvedBy : null;
    return [
      emp ? `${emp.firstName} ${emp.lastName}` : '',
      cat?.name ?? '',
      c.date ? new Date(c.date).toLocaleDateString('en-IN') : '',
      c.amount,
      c.currency,
      c.description ?? '',
      c.paymentMethod ?? '',
      c.status,
      approver ? `${approver.firstName} ${approver.lastName}` : '',
      c.approvedAt ? new Date(c.approvedAt).toLocaleString('en-IN') : '',
      c.rejectedReason ?? '',
      c.reimbursedAt ? new Date(c.reimbursedAt).toLocaleString('en-IN') : '',
      c.reimbursementRef ?? '',
      c.createdAt ? new Date(c.createdAt).toLocaleString('en-IN') : '',
    ]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',');
  });
  return [headers.join(','), ...lines].join('\n');
}

function downloadCSV(csv: string, filename: string): void {
  // Prepend a BOM so Excel opens the file in UTF-8 instead of mangling rupee
  // symbols and accented employee names.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_VARIANT: Record<
  ExpenseClaimStatus,
  'success' | 'warning' | 'destructive' | 'secondary' | 'default'
> = {
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  reimbursed: 'default',
};

export default function ExpenseListPage(): ReactElement {
  const [status, setStatus] = useState<string>('');
  const { data, isLoading } = useExpenseClaims({ limit: 50, status: status || undefined });
  const approve = useApproveExpenseClaim();
  const reject = useRejectExpenseClaim();
  const reimburse = useReimburseExpenseClaim();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [reimbursingId, setReimbursingId] = useState<string | null>(null);
  const [refNo, setRefNo] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleExport = async (): Promise<void> => {
    if (exporting) return;
    setExporting(true);
    try {
      // Page through every matching claim under the current status filter.
      // Backend pagination plugin caps each page at 100 rows; 50 pages = 5000
      // claims is a generous safety stop for an admin export.
      const PAGE_SIZE = 100;
      const MAX_PAGES = 50;
      const allRows: ExpenseClaim[] = [];
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await expenseClaimsApi.list({
          page,
          limit: PAGE_SIZE,
          ...(status ? { status } : {}),
        });
        const rows = res?.data ?? [];
        allRows.push(...rows);
        if (rows.length < PAGE_SIZE) break;
      }
      if (allRows.length === 0) {
        toast.info('No expense claims to export');
        return;
      }
      const csv = buildCSV(allRows);
      const stamp = new Date().toISOString().slice(0, 10);
      const suffix = status ? `-${status}` : '';
      downloadCSV(csv, `expense-claims${suffix}-${stamp}.csv`);
      toast.success(
        `Exported ${allRows.length} expense claim${allRows.length === 1 ? '' : 's'}`,
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Failed to export';
      toast.error(msg);
    } finally {
      setExporting(false);
    }
  };

  const submitReject = (): void => {
    if (!rejectingId || !reason.trim()) return;
    reject.mutate(
      { id: rejectingId, reason },
      {
        onSuccess: () => {
          setRejectingId(null);
          setReason('');
        },
      },
    );
  };

  const submitReimburse = (): void => {
    if (!reimbursingId) return;
    reimburse.mutate(
      { id: reimbursingId, reimbursementRef: refNo || undefined },
      {
        onSuccess: () => {
          setReimbursingId(null);
          setRefNo('');
        },
      },
    );
  };

  const columns: DataTableColumn<ExpenseClaim>[] = [
    {
      key: 'employee',
      header: 'Employee',
      cell: (c) => {
        const e = typeof c.employeeId === 'object' ? c.employeeId : null;
        return e ? `${e.firstName} ${e.lastName}` : '—';
      },
    },
    {
      key: 'category',
      header: 'Category',
      cell: (c) => (typeof c.category === 'object' ? c.category.name : '—'),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (c) => new Date(c.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (c) => (
        <span className="font-medium">
          {c.currency} {c.amount.toLocaleString('en-IN')}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      width: '140px',
      cell: (c) => (
        <div className="flex gap-1">
          {c.status === 'pending' && (
            <>
              <button
                onClick={() => approve.mutate(c._id)}
                className="rounded-md p-1.5 text-success hover:bg-success/10"
                title="Approve"
              >
                <Check className="size-4" />
              </button>
              <button
                onClick={() => {
                  setRejectingId(c._id);
                  setReason('');
                }}
                className="rounded-md p-1.5 text-destructive hover:bg-destructive/10"
                title="Reject"
              >
                <X className="size-4" />
              </button>
            </>
          )}
          {c.status === 'approved' && (
            <button
              onClick={() => {
                setReimbursingId(c._id);
                setRefNo('');
              }}
              className="rounded-md p-1.5 text-primary hover:bg-primary/10"
              title="Mark reimbursed"
            >
              <Wallet className="size-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expense Claims"
        description="Review, approve and reimburse employee expenses"
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Expenses' },
          { label: 'Claims' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={handleExport} loading={exporting}>
            <Download className="mr-2 size-4" />
            Export CSV
          </Button>
        }
      />

      <div className="flex items-center gap-3">
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-48">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="reimbursed">Reimbursed</option>
          <option value="draft">Draft</option>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        loading={isLoading}
        rowKey={(c) => c._id}
        emptyTitle="No expense claims"
        emptyDescription="Submitted claims will appear here"
      />

      <Dialog open={!!rejectingId} onClose={() => setRejectingId(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Reject expense claim</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Label htmlFor="ec-rej">Reason *</Label>
          <Textarea
            id="ec-rej"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectingId(null)}>
            Cancel
          </Button>
          <Button onClick={submitReject} loading={reject.isPending} disabled={!reason.trim()}>
            Reject
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!reimbursingId} onClose={() => setReimbursingId(null)} size="sm">
        <DialogHeader>
          <DialogTitle>Mark as reimbursed</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-2">
          <Label htmlFor="ec-ref">Reimbursement reference</Label>
          <Input
            id="ec-ref"
            value={refNo}
            onChange={(e) => setRefNo(e.target.value)}
            placeholder="UTR / Cheque no. / Transaction id"
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setReimbursingId(null)}>
            Cancel
          </Button>
          <Button onClick={submitReimburse} loading={reimburse.isPending}>
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}
