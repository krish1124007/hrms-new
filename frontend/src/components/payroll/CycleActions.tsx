import { useState, type ReactElement } from 'react';
import { CheckCircle2, FileText, Lock, Play, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useGeneratePayslips,
  useLockCycle,
  useMarkCyclePaid,
  useProcessCycle,
  useSettleCycle,
} from '@/hooks/use-payroll';
import type { PayrollCycle } from '@/lib/payroll.api';
import { canRunCycleAction, cyclePeriod, isStaleProcessing } from '@/lib/payroll-cycle';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';

interface CycleActionsProps {
  cycle: PayrollCycle;
  /**
   * `row` (the cycles table): only the actions the status allows.
   * `header` (the cycle page): every step of the lifecycle, the ones the
   * status does not allow disabled with the reason as a tooltip.
   */
  layout: 'row' | 'header';
}

/** Why an action is unavailable — the disabled button's tooltip. */
function blockedReason(cycle: PayrollCycle, action: 'process' | 'lock' | 'markPaid'): string {
  const { status } = cycle;
  if (status === 'processing') return 'A processing run is in progress';
  switch (action) {
    case 'process':
      return `A ${status} cycle cannot be re-processed`;
    case 'lock':
      return status === 'draft' ? 'Process the cycle first' : `The cycle is already ${status}`;
    case 'markPaid':
      return status === 'paid' ? 'The cycle is already paid' : 'Lock the cycle before marking it paid';
  }
}

/**
 * A disabled button ignores the pointer, so its tooltip goes on a wrapper
 * that still receives the hover.
 */
function Why({ reason, children }: { reason: string | null; children: ReactElement }): ReactElement {
  return reason ? (
    <span title={reason} className="inline-flex">
      {children}
    </span>
  ) : (
    children
  );
}

/**
 * Process / payslips / lock / mark paid / retry settlement for one payroll
 * cycle, offered only where the API's state machine allows them.
 */
export function CycleActions({ cycle, layout }: CycleActionsProps): ReactElement {
  const processMut = useProcessCycle();
  const generateMut = useGeneratePayslips();
  const lockMut = useLockCycle();
  const markPaidMut = useMarkCyclePaid();
  const settleMut = useSettleCycle();

  const [paidOpen, setPaidOpen] = useState(false);
  const [paymentRef, setPaymentRef] = useState('');
  const [lockOpen, setLockOpen] = useState(false);

  const period = cyclePeriod(cycle);
  const can = {
    process: canRunCycleAction(cycle, 'process'),
    payslips: canRunCycleAction(cycle, 'generatePayslips'),
    lock: canRunCycleAction(cycle, 'lock'),
    markPaid: canRunCycleAction(cycle, 'markPaid'),
    settle: canRunCycleAction(cycle, 'settle'),
  };
  const busy = (m: { isPending: boolean; variables?: unknown }): boolean =>
    m.isPending && m.variables === cycle._id;
  const isHeader = layout === 'header';
  const size = isHeader ? 'default' : 'sm';
  const icon = isHeader ? 'size-4' : 'mr-1 size-3';

  const process = (): void => {
    // A draft has nothing to lose; a re-run rebuilds every record.
    if (cycle.status !== 'draft') {
      const message = isStaleProcessing(cycle)
        ? `The last run of ${period} stopped part-way. Process it again?`
        : `Re-process ${period}? Every record is rebuilt from attendance and salaries; HR adjustments are kept.`;
      if (!window.confirm(message)) return;
    }
    processMut.mutate(cycle._id);
  };

  // Locking is one-way: it asks in a dialog that names the period first.
  const lock = (): void => setLockOpen(true);
  const confirmLock = (): void => {
    lockMut.mutate(cycle._id, { onSuccess: () => setLockOpen(false) });
  };

  const submitPaid = (): void => {
    const ref = paymentRef.trim();
    if (!ref) return;
    markPaidMut.mutate(
      { id: cycle._id, paymentRef: ref },
      {
        onSuccess: () => {
          setPaidOpen(false);
          setPaymentRef('');
        },
      },
    );
  };

  const showProcess = isHeader || can.process;
  const showPayslips = isHeader ? can.payslips : can.payslips && !cycle.payslipGeneratedAt;
  const showLock = isHeader || can.lock;
  const showMarkPaid = isHeader || can.markPaid;

  return (
    <>
      {showProcess && (
        <Why reason={can.process ? null : blockedReason(cycle, 'process')}>
          <Button size={size} variant="outline" onClick={process} disabled={!can.process} loading={busy(processMut)}>
            <Play className={icon} />
            Process
          </Button>
        </Why>
      )}
      {showPayslips && (
        <Button
          size={size}
          variant="outline"
          onClick={() => generateMut.mutate(cycle._id)}
          loading={busy(generateMut)}
        >
          <FileText className={icon} />
          Payslips
        </Button>
      )}
      {showLock && (
        <Why reason={can.lock ? null : blockedReason(cycle, 'lock')}>
          <Button size={size} variant="outline" onClick={lock} disabled={!can.lock} loading={busy(lockMut)}>
            <Lock className={icon} />
            Lock
          </Button>
        </Why>
      )}
      {showMarkPaid && (
        <Why reason={can.markPaid ? null : blockedReason(cycle, 'markPaid')}>
          <Button
            size={size}
            variant={isHeader ? 'default' : 'outline'}
            onClick={() => setPaidOpen(true)}
            disabled={!can.markPaid}
          >
            <CheckCircle2 className={icon} />
            Mark paid
          </Button>
        </Why>
      )}
      {isHeader && can.settle && (
        <Button
          size={size}
          variant="outline"
          onClick={() => settleMut.mutate(cycle._id)}
          loading={busy(settleMut)}
          title="Settle the loan instalments and expense claims this cycle paid — only what is still open"
        >
          <RotateCw className={icon} />
          Retry settlement
        </Button>
      )}

      <ConfirmDialog
        open={lockOpen}
        onClose={() => setLockOpen(false)}
        title={`Lock ${period}?`}
        description="The figures become final — no more re-processing or adjustments — and employees can see their payslips. This cannot be undone."
        confirmLabel={`Lock ${period}`}
        loading={lockMut.isPending}
        onConfirm={confirmLock}
      />

      <Dialog open={paidOpen} onClose={() => setPaidOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>Mark {period} as paid</DialogTitle>
          <DialogDescription>
            Every record is marked paid against this reference, then the loan instalments and expense
            claims the cycle counted are settled.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div>
            <Label htmlFor={`ref-${cycle._id}`}>Payment reference *</Label>
            <Input
              id={`ref-${cycle._id}`}
              value={paymentRef}
              onChange={(e) => setPaymentRef(e.target.value)}
              placeholder="UTR / NEFT / batch id"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setPaidOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submitPaid} disabled={!paymentRef.trim()} loading={markPaidMut.isPending}>
            Confirm
          </Button>
        </DialogFooter>
      </Dialog>
    </>
  );
}
