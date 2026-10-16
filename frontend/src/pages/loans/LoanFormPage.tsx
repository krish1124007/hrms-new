import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2, Calculator } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useCreateLoan, useLoan, useUpdateLoan } from '@/hooks/use-loans';
import { useEmployees } from '@/hooks/use-systemcore';
import { LOAN_TYPES, type LoanInput } from '@/lib/loans.api';
import { formatCurrency } from '@/lib/format';

const schema = z.object({
  employee: z.string().min(1, 'Select an employee'),
  type: z.enum([
    'salary_advance',
    'personal_loan',
    'emergency',
    'education',
    'medical',
    'other',
  ]),
  principalAmount: z.coerce.number().positive('Must be greater than 0'),
  interestRate: z.coerce.number().min(0).max(100),
  tenureMonths: z.coerce.number().int().min(1).max(360),
  startMonth: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function computeEmiClient(principal: number, ratePct: number, months: number): number {
  if (!principal || !months) return 0;
  if (ratePct <= 0) return principal / months;
  const r = ratePct / 12 / 100;
  const pow = Math.pow(1 + r, months);
  return (principal * r * pow) / (pow - 1);
}

export default function LoanFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data: existing, isLoading: loadingLoan } = useLoan(id);
  const create = useCreateLoan();
  const update = useUpdateLoan();
  const { data: empData } = useEmployees({ limit: 500 });
  const employees = empData?.data ?? [];

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      employee: '',
      type: 'personal_loan',
      principalAmount: 0,
      interestRate: 0,
      tenureMonths: 12,
    },
  });

  const principalAmount = watch('principalAmount');
  const interestRate = watch('interestRate');
  const tenureMonths = watch('tenureMonths');

  const preview = useMemo(() => {
    const emi = computeEmiClient(
      Number(principalAmount) || 0,
      Number(interestRate) || 0,
      Number(tenureMonths) || 0,
    );
    const totalPayable = emi * (Number(tenureMonths) || 0);
    const totalInterest = totalPayable - (Number(principalAmount) || 0);
    return { emi, totalPayable, totalInterest };
  }, [principalAmount, interestRate, tenureMonths]);

  const [editLocked, setEditLocked] = useState(false);

  useEffect(() => {
    if (isEdit && existing?.data) {
      const l = existing.data;
      setEditLocked(l.status !== 'pending');
      reset({
        employee: l.employee?._id ?? '',
        type: l.type,
        principalAmount: l.principalAmount,
        interestRate: l.interestRate,
        tenureMonths: l.tenureMonths,
        startMonth: l.startMonth ? l.startMonth.slice(0, 7) : '',
        reason: l.reason ?? '',
        notes: l.notes ?? '',
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = (values: FormValues): void => {
    const startMonth = values.startMonth ? `${values.startMonth}-01` : undefined;
    const payload: LoanInput = {
      ...values,
      startMonth,
      reason: values.reason || undefined,
      notes: values.notes || undefined,
    };

    if (isEdit && id) {
      update.mutate(
        { id, input: payload },
        { onSuccess: () => navigate(`/loans/${id}`) },
      );
    } else {
      create.mutate(payload, {
        onSuccess: (res) => navigate(`/loans/${res.data._id}`),
      });
    }
  };

  if (isEdit && loadingLoan) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit loan' : 'New loan application'}
        description={isEdit ? 'Update loan details' : 'Apply for an advance, personal loan, or emergency funding'}
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Loans', to: '/loans' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/loans')}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      {editLocked && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          This loan is no longer in <strong>pending</strong> status — fields are read-only.
          Use the actions on the detail page to approve, disburse, or record payments.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Application</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="l-emp">Employee *</Label>
              <Select id="l-emp" disabled={editLocked} {...register('employee')}>
                <option value="">Select an employee</option>
                {employees.map((e) => (
                  <option key={e._id} value={e._id}>
                    {e.firstName} {e.lastName} ({e.employeeId})
                  </option>
                ))}
              </Select>
              {errors.employee && (
                <p className="mt-1 text-xs text-destructive">{errors.employee.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="l-type">Loan type *</Label>
              <Select id="l-type" disabled={editLocked} {...register('type')}>
                {LOAN_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="l-reason">Reason</Label>
              <Input
                id="l-reason"
                placeholder="e.g., medical emergency, home renovation"
                disabled={editLocked}
                {...register('reason')}
              />
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Terms</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <Label htmlFor="l-principal">Principal amount (₹) *</Label>
              <Input
                id="l-principal"
                type="number"
                step="100"
                min="1"
                disabled={editLocked}
                {...register('principalAmount')}
              />
              {errors.principalAmount && (
                <p className="mt-1 text-xs text-destructive">{errors.principalAmount.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="l-rate">Interest rate (% p.a.)</Label>
              <Input
                id="l-rate"
                type="number"
                step="0.1"
                min="0"
                max="100"
                disabled={editLocked}
                {...register('interestRate')}
              />
              <p className="mt-1 text-xs text-muted-foreground">0 for interest-free advances</p>
            </div>
            <div>
              <Label htmlFor="l-tenure">Tenure (months) *</Label>
              <Input
                id="l-tenure"
                type="number"
                min="1"
                max="360"
                disabled={editLocked}
                {...register('tenureMonths')}
              />
              {errors.tenureMonths && (
                <p className="mt-1 text-xs text-destructive">{errors.tenureMonths.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="l-start">First EMI month</Label>
              <Input id="l-start" type="month" disabled={editLocked} {...register('startMonth')} />
              <p className="mt-1 text-xs text-muted-foreground">Defaults to next month</p>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 rounded-md border border-dashed border-border bg-muted/30 p-4 sm:grid-cols-3">
            <div className="flex items-start gap-2">
              <Calculator className="mt-1 size-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Monthly EMI</p>
                <p className="text-lg font-semibold">
                  {preview.emi > 0 ? formatCurrency(preview.emi) : '—'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total interest</p>
              <p className="text-lg font-semibold">
                {preview.totalInterest > 0 ? formatCurrency(preview.totalInterest) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total payable</p>
              <p className="text-lg font-semibold">
                {preview.totalPayable > 0 ? formatCurrency(preview.totalPayable) : '—'}
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Notes</h2>
          <Textarea
            rows={3}
            placeholder="Internal notes (not shown to the employee)"
            {...register('notes')}
          />
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/loans')}>
            Cancel
          </Button>
          <Button
            type="submit"
            loading={create.isPending || update.isPending}
            disabled={editLocked}
          >
            {isEdit ? 'Save changes' : 'Submit application'}
          </Button>
        </div>
      </form>
    </div>
  );
}
