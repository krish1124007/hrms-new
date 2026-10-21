import { useState, type ReactElement } from 'react';
import { Plus, CalendarDays, ChevronLeft, ChevronRight, Copy, FileUp, Pencil, Trash2 } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useHolidays,
  useCreateHoliday,
  useUpdateHoliday,
  useDeleteHoliday,
  useDepartments,
  useRolloverHolidays,
} from '@/hooks/use-systemcore';
import type { Holiday } from '@/lib/systemcore.api';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';
import { businessDayKey } from '@/lib/business-day';
import { HolidayImportDialog } from './HolidayImportDialog';

const schema = z.object({
  name: z.string().min(1),
  date: z.string().min(1),
  type: z.enum(['public', 'optional', 'restricted']).default('public'),
  /** Empty = every department. */
  departments: z.array(z.string()).default([]),
  isRecurring: z.boolean().default(false),
  description: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

const TYPE_HINT: Record<Holiday['type'], string> = {
  public: 'A paid day off for the departments below (everyone when none are ticked).',
  optional: 'A working day; employees may take it off as leave.',
  restricted: 'A working day; shown on the calendar only.',
};

const TYPE_VARIANT: Record<Holiday['type'], 'success' | 'warning' | 'secondary'> = {
  public: 'success',
  optional: 'warning',
  restricted: 'secondary',
};

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

export default function HolidayListPage(): ReactElement {
  const [year, setYear] = useState(() => new Date().getFullYear());
  const { data, isLoading, error, refetch } = useHolidays({ limit: 200, year });
  const create = useCreateHoliday();
  const update = useUpdateHoliday();
  const remove = useDeleteHoliday();
  const rollover = useRolloverHolidays();
  const { has } = usePermissions();
  const canManage = has('holidays.create');
  // Only the holiday form needs them.
  const { data: deptData } = useDepartments({ limit: 100 }, { enabled: canManage });
  const departments = deptData?.data ?? [];

  const copyToNextYear = (): void => {
    const target = year + 1;
    if (
      !window.confirm(
        `Copy every recurring holiday to ${target}? Holidays already in ${target} are skipped.`,
      )
    ) {
      return;
    }
    rollover.mutate(target, { onSuccess: () => setYear(target) });
  };

  const [open, setOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'public', departments: [] },
  });
  const formType = watch('type');
  const formDepartments = watch('departments') ?? [];
  const toggleDepartment = (id: string, on: boolean): void => {
    setValue(
      'departments',
      on ? [...formDepartments, id] : formDepartments.filter((d) => d !== id),
      { shouldDirty: true },
    );
  };

  const openCreate = (): void => {
    setEditing(null);
    reset({ name: '', date: '', type: 'public', departments: [], isRecurring: false, description: '' });
    setOpen(true);
  };

  const openEdit = (h: Holiday): void => {
    setEditing(h);
    reset({
      name: h.name,
      // Holidays stored at IST midnight (the day before in UTC) still edit as their own day.
      date: businessDayKey(h.date),
      type: h.type,
      departments: (h.departments ?? []).map((d) => (typeof d === 'string' ? d : d._id)),
      isRecurring: h.isRecurring,
      description: h.description ?? '',
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

  const columns: DataTableColumn<Holiday>[] = [
    { key: 'name', header: 'Name', cell: (h) => <span className="font-medium">{h.name}</span> },
    {
      key: 'date',
      header: 'Date',
      cell: (h) => new Date(h.date).toLocaleDateString('en-IN', { dateStyle: 'medium' }),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (h) => <Badge variant={TYPE_VARIANT[h.type]}>{h.type}</Badge>,
    },
    {
      key: 'departments',
      header: 'Departments',
      cell: (h) =>
        h.departments?.length ? (
          <span className="text-xs">
            {h.departments.map((d) => (typeof d === 'string' ? d : d.name)).join(', ')}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">All</span>
        ),
    },
    {
      key: 'recurring',
      header: 'Recurring',
      cell: (h) => (h.isRecurring ? 'Yes' : 'No'),
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            header: '',
            width: '100px',
            cell: (h: Holiday) => (
              <div className="flex gap-1">
                <button
                  onClick={() => openEdit(h)}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <Pencil className="size-4" />
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${h.name}"?`)) remove.mutate(h._id);
                  }}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ),
          } satisfies DataTableColumn<Holiday>,
        ]
      : []),
  ];

  // Group by month for calendar view
  const byMonth: Record<number, Holiday[]> = {};
  (data?.data ?? []).forEach((h) => {
    const m = new Date(h.date).getMonth();
    byMonth[m] ??= [];
    byMonth[m].push(h);
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Holidays"
        description={`Company holidays for ${year}`}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Holidays' }]}
        actions={
          canManage ? (
            <>
              <Button size="sm" variant="outline" onClick={copyToNextYear} loading={rollover.isPending}>
                <Copy className="size-4" /> Copy recurring to {year + 1}
              </Button>
              <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                <FileUp className="size-4" /> Import
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="size-4" /> New Holiday
              </Button>
            </>
          ) : null
        }
      />

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-[4rem] text-center text-lg font-semibold">{year}</span>
        <Button variant="outline" size="sm" onClick={() => setYear((y) => y + 1)} aria-label="Next year">
          <ChevronRight className="size-4" />
        </Button>
        {year !== new Date().getFullYear() && (
          <Button variant="ghost" size="sm" onClick={() => setYear(new Date().getFullYear())}>
            This year
          </Button>
        )}
      </div>

      <Tabs value={view} onValueChange={(v) => setView(v as 'list' | 'calendar')}>
        <TabsList>
          <TabsTrigger value="list">List</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <DataTable
            columns={columns}
            data={data?.data ?? []}
            loading={isLoading}
            error={error}
            onRetry={() => void refetch()}
            rowKey={(h) => h._id}
            emptyTitle="No holidays defined"
            emptyDescription="Add public and optional holidays for the year"
          />
        </TabsContent>

        <TabsContent value="calendar">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MONTHS.map((m, i) => (
              <div
                key={i}
                className={cn(
                  'rounded-lg border border-border bg-card p-4 shadow-card',
                  byMonth[i] ? '' : 'opacity-60',
                )}
              >
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
                  <CalendarDays className="size-4 text-muted-foreground" /> {m}
                </h3>
                {byMonth[i] ? (
                  <ul className="space-y-2">
                    {byMonth[i].map((h) => (
                      <li
                        key={h._id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span className="text-foreground">{h.name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {new Date(h.date).getDate()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No holidays</p>
                )}
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onClose={() => setOpen(false)} size="md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit holiday' : 'New holiday'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogBody className="space-y-4">
            <div>
              <Label htmlFor="h-name">Name *</Label>
              <Input id="h-name" {...register('name')} />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
            <div>
              <Label htmlFor="h-date">Date *</Label>
              <Input id="h-date" type="date" {...register('date')} />
            </div>
            <div>
              <Label htmlFor="h-type">Type</Label>
              <Select id="h-type" {...register('type')}>
                <option value="public">Public</option>
                <option value="optional">Optional</option>
                <option value="restricted">Restricted</option>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">{TYPE_HINT[formType ?? 'public']}</p>
            </div>
            <fieldset>
              <legend className="text-sm font-medium text-foreground">Departments</legend>
              <p className="mb-2 text-xs text-muted-foreground">
                Leave all unticked for a company-wide holiday.
              </p>
              <div className="grid max-h-40 grid-cols-2 gap-1 overflow-y-auto rounded-md border border-border p-2">
                {departments.length === 0 ? (
                  <p className="col-span-2 text-xs text-muted-foreground">No departments</p>
                ) : (
                  departments.map((d) => (
                    <label key={d._id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={formDepartments.includes(d._id)}
                        onChange={(e) => toggleDepartment(d._id, e.target.checked)}
                      />
                      {d.name}
                    </label>
                  ))
                )}
              </div>
            </fieldset>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isRecurring')} />
              Recurring every year
            </label>
            <div>
              <Label htmlFor="h-desc">Description</Label>
              <Textarea id="h-desc" rows={3} {...register('description')} />
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

      {canManage && <HolidayImportDialog open={importOpen} onClose={() => setImportOpen(false)} />}
    </div>
  );
}
