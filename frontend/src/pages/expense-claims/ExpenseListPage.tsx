import { useState, type ReactElement } from 'react';
import { Check, X, Wallet, Download, FileText, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { DataTable, Pagination, type DataTableColumn } from '@/components/ui/data-table';
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
import { RejectionReason } from '@/components/common/RejectionReason';
import { LinkedVisit, TravelBreakdown } from '@/components/expense-claims/TravelBreakdown';
import { travelSites } from '@/lib/field-route';
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
import { travelSummary } from '@/lib/field-route';
import { formatDate, formatDateTime, todayIST } from '@/lib/format';

const PAGE_SIZE = 25;

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
      c.date ? formatDate(c.date) : '',
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
  const [page, setPage] = useState(1);
  // Paged on the server — older claims are a page away, never silently cut off.
  const { data, isLoading, error, refetch } = useExpenseClaims({
    page,
    limit: PAGE_SIZE,
    status: status || undefined,
  });
  const approve = useApproveExpenseClaim();
  const reject = useRejectExpenseClaim();
  const reimburse = useReimburseExpenseClaim();

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // The claim being approved — its travel breakdown is shown in the dialog.
  const [approvingClaim, setApprovingClaim] = useState<ExpenseClaim | null>(null);
  const [detail, setDetail] = useState<ExpenseClaim | null>(null);
  const [acceptedAmount, setAcceptedAmount] = useState<number | ''>('');
  // What the employee claimed — the accepted amount may not exceed it.
  const [claimedAmount, setClaimedAmount] = useState(0);
  const acceptedError =
    acceptedAmount === ''
      ? null
      : acceptedAmount < 0
        ? 'The accepted amount cannot be negative'
        : acceptedAmount > claimedAmount
          ? `Cannot accept more than the ₹${claimedAmount.toLocaleString('en-IN')} claimed`
          : null;
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
      const stamp = todayIST();
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
      cell: (c) => (
        <div className="flex flex-col">
          <span>{typeof c.category === 'object' ? c.category.name : '—'}</span>
          {c.travel && <span className="text-xs text-muted-foreground">{travelSummary(c.travel)}</span>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Date',
      cell: (c) => formatDate(c.date),
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: (c) => (
        <div className="flex flex-col">
          <span className="font-medium">
            {c.currency} {c.amount.toLocaleString('en-IN')}
          </span>
          {c.acceptedAmount !== undefined && c.acceptedAmount !== c.amount && (
            <span className="text-xs text-muted-foreground">
              Accepted: {c.currency} {c.acceptedAmount.toLocaleString('en-IN')}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'receipts',
      header: 'Photo/Receipt',
      cell: (c) =>
        c.receiptUrls && c.receiptUrls.length > 0 ? (
          <div className="flex flex-col gap-1">
            {c.receiptUrls.map((r, i) => (
              <a
                key={i}
                href={r.fileUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <FileText className="size-3" /> Photo
              </a>
            ))}
          </div>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (c) => (
        <div className="flex flex-col items-start gap-1">
          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
          {c.status === 'rejected' && (
            <RejectionReason reason={c.rejectedReason} title="Claim rejection reason" />
          )}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: '170px',
      cell: (c) => (
        <div className="flex gap-1">
          <button
            onClick={() => setDetail(c)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"
            title="Details"
            aria-label="Details"
          >
            <Eye className="size-4" />
          </button>
          {c.status === 'pending' && (
            <>
              <button
                onClick={() => {
                  setApprovingId(c._id);
                  setApprovingClaim(c);
                  setAcceptedAmount(c.amount);
                  setClaimedAmount(c.amount);
                }}
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
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="w-48"
        >
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
        error={error}
        onRetry={() => void refetch()}
        rowKey={(c) => c._id}
        emptyTitle="No expense claims"
        emptyDescription="Submitted claims will appear here"
      />
      <Pagination page={page} pages={data?.pagination?.pages ?? 1} onPageChange={setPage} />

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

      <Dialog open={!!approvingId} onClose={() => setApprovingId(null)} size={approvingClaim?.travel ? 'md' : 'sm'}>
        <DialogHeader>
          <DialogTitle>Approve expense claim</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {approvingClaim?._id === approvingId && approvingClaim.travel && (
            <TravelBreakdown travel={approvingClaim.travel} />
          )}
          {approvingClaim?._id === approvingId && approvingClaim.visitId && (
            <LinkedVisit
              visitId={approvingClaim.visitId}
              date={approvingClaim.date}
              sites={travelSites(approvingClaim.travel?.points)}
            />
          )}
          <div>
            <Label htmlFor="ec-accept">Accepted amount (₹)</Label>
            <Input
              id="ec-accept"
              type="number"
              min={0}
              max={claimedAmount}
              step="0.01"
              value={acceptedAmount}
              onChange={(e) => setAcceptedAmount(e.target.value === '' ? '' : Number(e.target.value))}
              aria-invalid={!!acceptedError}
            />
            {acceptedError ? (
              <p className="mt-1 text-xs text-destructive">{acceptedError}</p>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                Claimed ₹{claimedAmount.toLocaleString('en-IN')}. Lower it to approve part of the claim.
              </p>
            )}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setApprovingId(null)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (!approvingId) return;
              approve.mutate(
                { id: approvingId, acceptedAmount: acceptedAmount === '' ? undefined : Number(acceptedAmount) },
                {
                  onSuccess: () => setApprovingId(null),
                }
              );
            }}
            loading={approve.isPending}
            disabled={!!acceptedError}
          >
            Approve
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={!!detail} onClose={() => setDetail(null)} size="md">
        <DialogHeader>
          <DialogTitle>Expense claim</DialogTitle>
        </DialogHeader>
        {detail && <ClaimDetails claim={detail} />}
        <DialogFooter>
          <Button variant="outline" onClick={() => setDetail(null)}>
            Close
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

/** Everything about one claim — with the travel breakdown and linked visit when it has them. */
function ClaimDetails({ claim }: { claim: ExpenseClaim }): ReactElement {
  const emp = typeof claim.employeeId === 'object' ? claim.employeeId : null;
  const cat = typeof claim.category === 'object' ? claim.category : null;
  return (
    <DialogBody className="space-y-4 text-sm">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="text-muted-foreground">Employee</dt>
        <dd>
          {emp ? `${emp.firstName} ${emp.lastName}` : '—'}
          {emp?.employeeId ? <span className="ml-1 text-xs text-muted-foreground">({emp.employeeId})</span> : null}
        </dd>
        <dt className="text-muted-foreground">Category</dt>
        <dd>{cat?.name ?? '—'}</dd>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{formatDate(claim.date)}</dd>
        <dt className="text-muted-foreground">Claimed</dt>
        <dd className="font-medium">
          {claim.currency} {claim.amount.toLocaleString('en-IN')}
          {claim.acceptedAmount !== undefined && claim.acceptedAmount !== claim.amount && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              Accepted: {claim.currency} {claim.acceptedAmount.toLocaleString('en-IN')}
            </span>
          )}
        </dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          <Badge variant={STATUS_VARIANT[claim.status]}>{claim.status}</Badge>
        </dd>
        {claim.description ? (
          <>
            <dt className="text-muted-foreground">Description</dt>
            <dd className="whitespace-pre-line">{claim.description}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Submitted</dt>
        <dd>{formatDateTime(claim.createdAt)}</dd>
      </dl>
      {claim.travel && (
        <div className="space-y-2">
          <h4 className="font-semibold">Travel allowance</h4>
          <TravelBreakdown travel={claim.travel} />
        </div>
      )}
      {claim.visitId && <LinkedVisit visitId={claim.visitId} date={claim.date} sites={travelSites(claim.travel?.points)} />}
      {claim.status === 'rejected' && <RejectionReason reason={claim.rejectedReason} title="Claim rejection reason" />}
    </DialogBody>
  );
}
