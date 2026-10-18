import { useEffect, useState, type ReactElement } from 'react';
import { RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogBody,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useUpdateCycleRecord } from '@/hooks/use-payroll';
import {
  ADJUSTABLE_FIELDS,
  type AdjustableField,
  type PayrollCycle,
  type PayrollRecord,
  type RecordAdjustmentsInput,
} from '@/lib/payroll.api';
import { CYCLE_STATUS_VARIANT, canRunCycleAction, cyclePeriod } from '@/lib/payroll-cycle';

const FIELD_LABEL: Record<AdjustableField, string> = {
  arrears: 'Arrears',
  advance: 'Advance',
  expense: 'Expense',
  reimbursements: 'Reimbursements',
  loanDeduction: 'Loan EMI deduction',
  tds: 'TDS',
};

const FIELD_HINT: Record<AdjustableField, string> = {
  arrears: 'Earning',
  advance: 'Deduction — salary advance recovered',
  expense: 'Earning — expenses paid with salary',
  reimbursements: 'Earning — approved expense claims',
  loanDeduction: 'Deduction — loan instalments',
  tds: 'Deduction — income tax',
};

const inr = (n: number): string =>
  `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Draft = Record<AdjustableField, string> & { note: string };

/** The override as the input shows it: blank = no override (the computed figure applies). */
function draftOf(record: PayrollRecord): Draft {
  const manual = record.manualAdjustments;
  const draft = { note: manual?.note ?? '' } as Draft;
  for (const field of ADJUSTABLE_FIELDS) {
    const value = manual?.[field];
    draft[field] = value === null || value === undefined ? '' : String(value);
  }
  return draft;
}

/** The computed figure behind a field. Records from before overrides existed carry it on the field itself. */
function computedOf(record: PayrollRecord, field: AdjustableField): number {
  return record.computed?.[field] ?? (record.manualAdjustments?.[field] == null ? record[field] : 0);
}

/**
 * The PATCH body: only the fields whose override changed. A blank field is
 * `null` (clear the override); it is never sent as `""`, which the API would
 * coerce to 0. Returns the per-field errors instead when an amount is invalid.
 */
function diff(
  record: PayrollRecord,
  draft: Draft,
): { body: RecordAdjustmentsInput; errors: Partial<Record<AdjustableField, string>> } {
  const body: RecordAdjustmentsInput = {};
  const errors: Partial<Record<AdjustableField, string>> = {};
  for (const field of ADJUSTABLE_FIELDS) {
    const raw = draft[field].trim();
    const before = record.manualAdjustments?.[field] ?? null;
    let after: number | null = null;
    if (raw !== '') {
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        errors[field] = 'Enter an amount';
        continue;
      }
      if (n < 0) {
        errors[field] = 'Cannot be negative';
        continue;
      }
      after = Math.round(n * 100) / 100;
    }
    if (after !== before) body[field] = after;
  }
  const noteBefore = record.manualAdjustments?.note?.trim() ?? '';
  const noteAfter = draft.note.trim();
  if (noteAfter !== noteBefore) body.note = noteAfter || null;
  return { body, errors };
}

function apiMessage(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string } } }; message?: string };
  return e.response?.data?.error?.message ?? e.message ?? 'Could not save the adjustments';
}

interface RecordAdjustmentsDialogProps {
  /** The record being adjusted; `null` closes the dialog. */
  record: PayrollRecord | null;
  cycle: PayrollCycle;
  onClose: () => void;
}

/**
 * HR overrides on one payroll record: arrears, advance, expense,
 * reimbursements, loan deduction, TDS and a note. Each field starts as the
 * current override (blank = the computed figure, shown as the hint) and only
 * the fields that change are sent. Overtime is computed from approved
 * requests and is not editable here.
 */
export function RecordAdjustmentsDialog({
  record,
  cycle,
  onClose,
}: RecordAdjustmentsDialogProps): ReactElement {
  const update = useUpdateCycleRecord();
  const [draft, setDraft] = useState<Draft | null>(record ? draftOf(record) : null);
  const [errors, setErrors] = useState<Partial<Record<AdjustableField, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(record ? draftOf(record) : null);
    setErrors({});
    setServerError(null);
  }, [record]);

  const editable = canRunCycleAction(cycle, 'edit');
  const emp = record && typeof record.employeeId === 'object' ? record.employeeId : null;
  const pending = record && draft ? diff(record, draft) : null;
  const changed = !!pending && Object.keys(pending.body).length > 0;
  // An invalid amount is a change too: Save then explains what is wrong.
  const dirty = changed || (!!pending && Object.keys(pending.errors).length > 0);

  const set = (key: keyof Draft, value: string): void => {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
    if (key !== 'note') setErrors((e) => ({ ...e, [key]: undefined }));
    setServerError(null);
  };

  const save = (): void => {
    if (!record || !pending) return;
    if (Object.keys(pending.errors).length > 0) {
      setErrors(pending.errors);
      return;
    }
    if (!changed) return;
    update.mutate(
      { cycleId: cycle._id, recordId: record._id, input: pending.body },
      {
        onSuccess: onClose,
        // 409 ITEM_HELD (a claim / EMI another cycle holds) or CYCLE_NOT_EDITABLE.
        onError: (err) => setServerError(apiMessage(err)),
      },
    );
  };

  return (
    <Dialog open={!!record} onClose={onClose} size="lg">
      <DialogHeader>
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <DialogTitle>Adjustments{emp ? ` — ${emp.firstName} ${emp.lastName}` : ''}</DialogTitle>
          <Badge variant={CYCLE_STATUS_VARIANT[cycle.status]} data-testid="cycle-status">
            {cycle.status}
          </Badge>
        </div>
        <DialogDescription>
          {cyclePeriod(cycle)} ·{' '}
          {editable
            ? 'Leave a field blank to use the computed figure. Overrides survive re-processing.'
            : `A ${cycle.status} cycle cannot be adjusted.`}
        </DialogDescription>
      </DialogHeader>
      {record && draft && (
        <DialogBody className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {ADJUSTABLE_FIELDS.map((field) => {
              const id = `adj-${field}`;
              const computed = computedOf(record, field);
              const overridden = draft[field].trim() !== '';
              return (
                <div key={field}>
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor={id}>{FIELD_LABEL[field]}</Label>
                    {overridden && editable && (
                      <button
                        type="button"
                        onClick={() => set(field, '')}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        aria-label={`Use computed ${FIELD_LABEL[field].toLowerCase()}`}
                      >
                        <RotateCcw className="size-3" /> Use computed
                      </button>
                    )}
                  </div>
                  <Input
                    id={id}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={draft[field]}
                    placeholder={`Computed: ${inr(computed)}`}
                    disabled={!editable}
                    aria-invalid={!!errors[field]}
                    onChange={(e) => set(field, e.target.value)}
                    className="mt-1"
                  />
                  <p className={errors[field] ? 'mt-1 text-xs text-destructive' : 'mt-1 text-xs text-muted-foreground'}>
                    {errors[field] ??
                      (overridden ? `Override · computed ${inr(computed)}` : FIELD_HINT[field])}
                  </p>
                </div>
              );
            })}
          </div>
          <div>
            <Label htmlFor="adj-note">Note</Label>
            <Textarea
              id="adj-note"
              rows={2}
              maxLength={500}
              value={draft.note}
              disabled={!editable}
              onChange={(e) => set('note', e.target.value)}
              placeholder="Why these figures were changed — kept on the record"
              className="mt-1"
            />
          </div>
          {serverError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
        </DialogBody>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          {editable ? 'Cancel' : 'Close'}
        </Button>
        {editable && (
          <Button onClick={save} disabled={!dirty} loading={update.isPending}>
            Save
          </Button>
        )}
      </DialogFooter>
    </Dialog>
  );
}
