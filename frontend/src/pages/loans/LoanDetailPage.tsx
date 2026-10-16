import { useState, type ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Trash2,
  CheckCircle2,
  XCircle,
  Wallet,
  Banknote,
  IndianRupee,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useApproveLoan,
  useDeleteLoan,
  useDisburseLoan,
  useLoan,
  useRecordLoanPayment,
  useRejectLoan,
} from '@/hooks/use-loans';
import { LOAN_TYPES, type InstallmentStatus, type LoanStatus } from '@/lib/loans.api';
import { formatCurrency, formatDate } from '@/lib/format';

const STATUS_VARIANT: Record<LoanStatus, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  pending: 'warning',
  approved: 'default',
  rejected: 'destructive',
  disbursed: 'default',
  active: 'success',
  closed: 'secondary',
  cancelled: 'secondary',
};

const INST_VARIANT: Record<InstallmentStatus, 'default' | 'success' | 'warning' | 'secondary' | 'destructive'> = {
  scheduled: 'secondary',
  paid: 'success',
  partial: 'warning',
  skipped: 'secondary',
  overdue: 'destructive',
};

export default function LoanDetailPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useLoan(id);
  const approve = useApproveLoan();
  const reject = useRejectLoan();
  const disburse = useDisburseLoan();
  const remove = useDeleteLoan();
  const recordPayment = useRecordLoanPayment();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [payOpen, setPayOpen] = useState(false);
  const [payInstallmentId, setPayInstallmentId] = useState('');
  const [payAmount, setPayAmount] = useState<string>('');
  const [payNotes, setPayNotes] = useState('');

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const loan = data?.data;
  if (!loan) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-muted-foreground">Loan not found</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/loans')}>
          Back
        </Button>
      </div>
    );
  }

  const typeLabel = LOAN_TYPES.find((t) => t.value === loan.type)?.label ?? loan.type;
  const isPayable = loan.status === 'active' || loan.status === 'disbursed';
  const progress = loan.totalPayable > 0 ? (loan.totalPaid / loan.totalPayable) * 100 : 0;

  const handleDelete = (): void => {
    if (!confirm(`Delete loan ${loan.loanNumber}? This cannot be undone.`)) return;
    remove.mutate(loan._id, { onSuccess: () => navigate('/loans') });
  };

  const handleApprove = (): void => {
    if (!confirm(`Approve loan ${loan.loanNumber}?`)) return;
    approve.mutate({ id: loan._id });
  };

  const submitReject = (): void => {
    if (!rejectReason.trim()) return;
    reject.mutate(
      { id: loan._id, reason: rejectReason.trim() },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setRejectReason('');
        },
      },
    );
  };

  const handleDisburse = (): void => {
    if (!confirm(`Disburse ₹${loan.principalAmount.toLocaleString('en-IN')} for ${loan.loanNumber}?`))
      return;
    disburse.mutate({ id: loan._id });
  };

  const openPayment = (instId: string, remainingAmount: number): void => {
    setPayInstallmentId(instId);
    setPayAmount(remainingAmount.toFixed(2));
    setPayNotes('');
    setPayOpen(true);
  };

  const submitPayment = (): void => {
    const amt = Number(payAmount);
    if (!payInstallmentId || !amt || amt <= 0) return;
    recordPayment.mutate(
      {
        id: loan._id,
        installmentId: payInstallmentId,
        amount: amt,
        notes: payNotes || undefined,
      },
      { onSuccess: () => setPayOpen(false) },
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={loan.loanNumber}
        description={typeLabel}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Loans', to: '/loans' },
          { label: loan.loanNumber },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/loans')}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {loan.status === 'pending' && (
              <>
                <Button size="sm" onClick={handleApprove} loading={approve.isPending}>
                  <CheckCircle2 className="size-4" /> Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => setRejectOpen(true)}>
                  <XCircle className="size-4" /> Reject
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/loans/${loan._id}/edit`}>
                    <Pencil className="size-4" /> Edit
                  </Link>
                </Button>
              </>
            )}
            {loan.status === 'approved' && (
              <Button size="sm" onClick={handleDisburse} loading={disburse.isPending}>
                <Banknote className="size-4" /> Disburse
              </Button>
            )}
            {(loan.status === 'pending' ||
              loan.status === 'rejected' ||
              loan.status === 'cancelled' ||
              loan.status === 'closed') && (
              <Button variant="outline" size="sm" onClick={handleDelete}>
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              {loan.employee && (
                <Link
                  to={`/employees/${loan.employee._id}`}
                  className="text-base font-semibold text-foreground hover:underline"
                >
                  {loan.employee.firstName} {loan.employee.lastName}
                </Link>
              )}
              <p className="font-mono text-xs text-muted-foreground">
                {loan.employee?.employeeId}
              </p>
              {loan.reason && (
                <p className="mt-2 max-w-md text-sm text-muted-foreground">{loan.reason}</p>
              )}
            </div>
            <Badge variant={STATUS_VARIANT[loan.status]} className="capitalize">
              {loan.status}
            </Badge>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <Detail label="Principal" value={formatCurrency(loan.principalAmount)} />
            <Detail label="Interest rate" value={`${loan.interestRate}% p.a.`} />
            <Detail label="Tenure" value={`${loan.tenureMonths} months`} />
            <Detail label="Monthly EMI" value={formatCurrency(loan.emiAmount)} />
            <Detail label="Total interest" value={formatCurrency(loan.totalInterest)} />
            <Detail label="Total payable" value={formatCurrency(loan.totalPayable)} />
            <Detail label="Applied on" value={formatDate(loan.appliedAt)} />
            {loan.disbursedOn && (
              <Detail label="Disbursed on" value={formatDate(loan.disbursedOn)} />
            )}
          </div>

          {loan.status === 'rejected' && loan.rejectedReason && (
            <div className="mt-6 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-destructive">
                Rejection reason
              </p>
              <p>{loan.rejectedReason}</p>
            </div>
          )}

          {loan.notes && (
            <div className="mt-6 rounded-md bg-muted/40 p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Internal notes
              </p>
              <p className="whitespace-pre-wrap">{loan.notes}</p>
            </div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="mb-4 flex items-center gap-2 text-base font-semibold">
            <IndianRupee className="size-4 text-muted-foreground" /> Repayment summary
          </h3>
          <div className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Paid</span>
                <span>{progress.toFixed(1)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-success transition-all"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Total paid</p>
                <p className="font-semibold">{formatCurrency(loan.totalPaid)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Outstanding</p>
                <p className="font-semibold">{formatCurrency(loan.outstandingTotal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Principal left</p>
                <p className="font-semibold">{formatCurrency(loan.outstandingPrincipal)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant={STATUS_VARIANT[loan.status]} className="mt-0.5 capitalize">
                  {loan.status}
                </Badge>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold">EMI schedule</h3>
          <p className="text-xs text-muted-foreground">
            {loan.installments.length} installment{loan.installments.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">Due date</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Principal</th>
                <th className="px-3 py-2 text-right">Interest</th>
                <th className="px-3 py-2 text-right">Paid</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {loan.installments.map((inst) => {
                const remaining = inst.amount - inst.paidAmount;
                return (
                  <tr key={inst._id ?? inst.installmentNumber} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-xs">{inst.installmentNumber}</td>
                    <td className="px-3 py-2 text-xs">{formatDate(inst.dueDate)}</td>
                    <td className="px-3 py-2 text-right">{formatCurrency(inst.amount)}</td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {formatCurrency(inst.principalAmount)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {formatCurrency(inst.interestAmount)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {inst.paidAmount > 0 ? formatCurrency(inst.paidAmount) : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={INST_VARIANT[inst.status]} className="capitalize">
                        {inst.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {isPayable && inst.status !== 'paid' && inst._id && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openPayment(inst._id as string, remaining)}
                        >
                          <Wallet className="size-3" /> Pay
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Reject loan</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The applicant will see this reason. Be specific so they can re-apply if appropriate.
          </p>
          <div>
            <Label htmlFor="rj-reason">Reason *</Label>
            <Textarea
              id="rj-reason"
              rows={4}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., insufficient repayment capacity given existing commitments"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submitReject}
            disabled={!rejectReason.trim()}
            loading={reject.isPending}
          >
            Confirm rejection
          </Button>
        </DialogFooter>
      </Dialog>

      <Dialog open={payOpen} onClose={() => setPayOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Record payment</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div>
            <Label htmlFor="pay-amount">Amount (₹) *</Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              min="0"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="pay-notes">Notes</Label>
            <Textarea
              id="pay-notes"
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="e.g., deducted via April payroll"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPayOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={submitPayment}
            disabled={!payAmount || Number(payAmount) <= 0}
            loading={recordPayment.isPending}
          >
            Record payment
          </Button>
        </DialogFooter>
      </Dialog>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
