import { useEffect, useState, type ReactElement } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  useCreateDisciplinary,
  useDisciplinary,
  useUpdateDisciplinary,
} from '@/hooks/use-disciplinary';
import { useEmployees } from '@/hooks/use-systemcore';
import {
  DISCIPLINARY_SEVERITIES,
  DISCIPLINARY_TYPES,
  type DisciplinaryInput,
} from '@/lib/disciplinary.api';

const schema = z.object({
  employee: z.string().min(1, 'Select an employee'),
  type: z.enum([
    'verbal_warning',
    'written_warning',
    'final_warning',
    'pip',
    'suspension',
    'termination',
    'other',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().min(1, 'Description is required').max(5000),
  incidentDate: z.string().optional(),
  pipStartDate: z.string().optional(),
  pipEndDate: z.string().optional(),
  pipGoals: z.string().optional(),
  confidential: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function DisciplinaryFormPage(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { data: existing, isLoading: loadingCase } = useDisciplinary(id);
  const create = useCreateDisciplinary();
  const update = useUpdateDisciplinary();
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
      type: 'verbal_warning',
      severity: 'medium',
      title: '',
      description: '',
      confidential: true,
    },
  });

  const watchedType = watch('type');
  const isPip = watchedType === 'pip';
  const [editLocked, setEditLocked] = useState(false);

  useEffect(() => {
    if (isEdit && existing?.data) {
      const a = existing.data;
      setEditLocked(
        a.status === 'resolved' || a.status === 'failed' || a.status === 'cancelled',
      );
      reset({
        employee: a.employee?._id ?? '',
        type: a.type,
        severity: a.severity,
        title: a.title,
        description: a.description,
        incidentDate: a.incidentDate ? a.incidentDate.slice(0, 10) : '',
        pipStartDate: a.pipStartDate ? a.pipStartDate.slice(0, 10) : '',
        pipEndDate: a.pipEndDate ? a.pipEndDate.slice(0, 10) : '',
        pipGoals: a.pipGoals ?? '',
        confidential: a.confidential,
      });
    }
  }, [isEdit, existing, reset]);

  const onSubmit = (values: FormValues): void => {
    const payload: DisciplinaryInput = {
      ...values,
      incidentDate: values.incidentDate || undefined,
      pipStartDate: values.pipStartDate || undefined,
      pipEndDate: values.pipEndDate || undefined,
      pipGoals: values.pipGoals || undefined,
    };

    if (isEdit && id) {
      update.mutate(
        { id, input: payload },
        { onSuccess: () => navigate(`/disciplinary/${id}`) },
      );
    } else {
      create.mutate(payload, {
        onSuccess: (res) => navigate(`/disciplinary/${res.data._id}`),
      });
    }
  };

  if (isEdit && loadingCase) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? 'Edit case' : 'New disciplinary case'}
        description={
          isEdit
            ? 'Update case details'
            : 'Document a warning, PIP, or disciplinary action'
        }
        breadcrumbs={[
          { label: 'Home', to: '/dashboard' },
          { label: 'Disciplinary', to: '/disciplinary' },
          { label: isEdit ? 'Edit' : 'New' },
        ]}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/disciplinary')}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      {editLocked && (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-warning">
          This case is closed and read-only.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <h2 className="mb-4 text-base font-semibold">Case details</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="d-emp">Employee *</Label>
              <Select id="d-emp" disabled={editLocked} {...register('employee')}>
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
              <Label htmlFor="d-type">Type *</Label>
              <Select id="d-type" disabled={editLocked} {...register('type')}>
                {DISCIPLINARY_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="d-sev">Severity *</Label>
              <Select id="d-sev" disabled={editLocked} {...register('severity')}>
                {DISCIPLINARY_SEVERITIES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="d-incident">Incident date</Label>
              <Input
                id="d-incident"
                type="date"
                disabled={editLocked}
                {...register('incidentDate')}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="d-title">Title *</Label>
              <Input
                id="d-title"
                placeholder="e.g., Repeated late attendance"
                disabled={editLocked}
                {...register('title')}
              />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="d-desc">Description *</Label>
              <Textarea
                id="d-desc"
                rows={5}
                placeholder="Describe what happened, any prior warnings, expectations, and the employee's response."
                disabled={editLocked}
                {...register('description')}
              />
              {errors.description && (
                <p className="mt-1 text-xs text-destructive">{errors.description.message}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm md:col-span-2">
              <input
                type="checkbox"
                disabled={editLocked}
                {...register('confidential')}
              />
              Mark as confidential (limit visibility to managers and HR)
            </label>
          </div>
        </Card>

        {isPip && (
          <Card className="p-6">
            <h2 className="mb-4 text-base font-semibold">Performance Improvement Plan</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <Label htmlFor="pip-start">PIP start date</Label>
                <Input
                  id="pip-start"
                  type="date"
                  disabled={editLocked}
                  {...register('pipStartDate')}
                />
              </div>
              <div>
                <Label htmlFor="pip-end">PIP end date</Label>
                <Input
                  id="pip-end"
                  type="date"
                  disabled={editLocked}
                  {...register('pipEndDate')}
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="pip-goals">Goals &amp; success criteria</Label>
                <Textarea
                  id="pip-goals"
                  rows={4}
                  placeholder="List measurable goals the employee must meet to successfully complete the PIP."
                  disabled={editLocked}
                  {...register('pipGoals')}
                />
              </div>
            </div>
          </Card>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/disciplinary')}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={editLocked}
            loading={create.isPending || update.isPending}
          >
            {isEdit ? 'Save changes' : 'Create case'}
          </Button>
        </div>
      </form>
    </div>
  );
}
