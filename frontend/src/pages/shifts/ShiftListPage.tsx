import { useState, type ReactElement } from 'react';
import { Plus, Pencil, Trash2, Clock } from 'lucide-react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useShifts, useCreateShift, useUpdateShift, useDeleteShift } from '@/hooks/use-systemcore';
import type { Shift } from '@/lib/systemcore.api';
import { cn } from '@/lib/utils';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const schema = z.object({
  name: z.string().min(1),
  startTime: z.string().regex(TIME, 'HH:mm'),
  endTime: z.string().regex(TIME, 'HH:mm'),
  graceMinutes: z.coerce.number().int().min(0).default(15),
  fullDayHours: z.coerce.number().min(0).default(8),
  halfDayHours: z.coerce.number().min(0).default(4),
  breakDuration: z.coerce.number().int().min(0).default(60),
  workDays: z.array(z.coerce.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
  isNightShift: z.boolean().default(false),
  isDefault: z.boolean().default(false),
  color: z.string().default('#3b82f6'),
});
type FormValues = z.infer<typeof schema>;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function ShiftListPage(): ReactElement {
  const { data, isLoading } = useShifts({ limit: 100 });
  const create = useCreateShift();
  const update = useUpdateShift();
  const remove = useDeleteShift();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Shift | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      workDays: [1, 2, 3, 4, 5],
      color: '#3b82f6',
      graceMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      breakDuration: 60,
      isNightShift: false,
      isDefault: false,
    },
  });

  const openCreate = (): void => {
    setEditing(null);
    reset({
      name: '',
      startTime: '09:00',
      endTime: '18:00',
      workDays: [1, 2, 3, 4, 5],
      color: '#3b82f6',
      graceMinutes: 15,
      fullDayHours: 8,
      halfDayHours: 4,
      breakDuration: 60,
      isNightShift: false,
      isDefault: false,
    });
    setOpen(true);
  };

  const openEdit = (s: Shift): void => {
    setEditing(s);
    reset({
      name: s.name,
      startTime: s.startTime,
      endTime: s.endTime,
      graceMinutes: s.graceMinutes,
      fullDayHours: s.fullDayHours,
      halfDayHours: s.halfDayHours,
      breakDuration: s.breakDuration,
      workDays: s.workDays,
      isNightShift: s.isNightShift,
      isDefault: s.isDefault,
      color: s.color,
    });
    setOpen(true);
  };

  const onSubmit = (values: FormValues): void => {
    if (editing) {
      update.mutate({ id: editing._id, input: values }, { onSuccess: () => setOpen(false) });
    } else {
      create.mutate(values, { onSuccess: () => setOpen(false) });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Shifts"
        description="Define working hours and schedules"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Shifts' }]}
        actions={
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-4" /> New Shift
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !data?.data || data.data.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={Clock}
              title="No shifts defined"
              description="Create work shifts to schedule employees"
              action={
                <Button onClick={openCreate}>
                  <Plus className="size-4" /> New Shift
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.data.map((s) => (
            <Card key={s._id} className="transition-shadow hover:shadow-elevated">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="rounded-lg p-2 text-white"
                      style={{ backgroundColor: s.color }}
                    >
                      <Clock className="size-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{s.name}</h3>
                      <p className="text-sm text-muted-foreground">
                        {s.startTime} – {s.endTime}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    {s.isDefault && <Badge variant="success">Default</Badge>}
                    {s.isNightShift && <Badge variant="secondary">Night</Badge>}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1">
                  {DAY_LABELS.map((d, i) => (
                    <span
                      key={i}
                      className={cn(
                        'flex size-6 items-center justify-center rounded text-[10px] font-bold',
                        s.workDays.includes(i)
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {d}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-border pt-3 text-xs text-muted-foreground">
                  <span>{s.fullDayHours}h day · {s.breakDuration}m break</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => openEdit(s)}
                      className="rounded-md p-1.5 hover:bg-muted hover:text-foreground"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Delete shift "${s.name}"?`)) remove.mutate(s._id);
                      }}
                      className="rounded-md p-1.5 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} size="lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit shift' : 'New shift'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="s-name">Name *</Label>
                <Input id="s-name" {...register('name')} />
                {errors.name && (
                  <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
                )}
              </div>
              <div>
                <Label htmlFor="s-color">Color</Label>
                <Input id="s-color" type="color" {...register('color')} className="h-10 p-1" />
              </div>
              <div>
                <Label htmlFor="s-start">Start time *</Label>
                <Input id="s-start" type="time" {...register('startTime')} />
              </div>
              <div>
                <Label htmlFor="s-end">End time *</Label>
                <Input id="s-end" type="time" {...register('endTime')} />
              </div>
              <div>
                <Label htmlFor="s-grace">Grace (min)</Label>
                <Input id="s-grace" type="number" {...register('graceMinutes')} />
              </div>
              <div>
                <Label htmlFor="s-break">Break (min)</Label>
                <Input id="s-break" type="number" {...register('breakDuration')} />
              </div>
              <div>
                <Label htmlFor="s-full">Full day hours</Label>
                <Input id="s-full" type="number" step="0.5" {...register('fullDayHours')} />
              </div>
              <div>
                <Label htmlFor="s-half">Half day hours</Label>
                <Input id="s-half" type="number" step="0.5" {...register('halfDayHours')} />
              </div>
            </div>

            <div>
              <Label>Work days</Label>
              <Controller
                control={control}
                name="workDays"
                render={({ field }) => (
                  <div className="mt-2 flex gap-2">
                    {DAY_NAMES.map((d, i) => {
                      const active = field.value.includes(i);
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? field.value.filter((x) => x !== i)
                              : [...field.value, i].sort();
                            field.onChange(next);
                          }}
                          className={cn(
                            'flex-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors',
                            active
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                          )}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('isNightShift')} />
                Night shift
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" {...register('isDefault')} />
                Set as default
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending || update.isPending}>
              {editing ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
    </div>
  );
}
