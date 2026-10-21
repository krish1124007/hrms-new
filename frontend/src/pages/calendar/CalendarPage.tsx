import { useMemo, useState, type ReactElement } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  CalendarDays,
  MapPin,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/ui/page-header';
import {
  Dialog,
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { calendarApi, type CalendarEvent, type CalendarEventInput } from '@/lib/calendar.api';
import { useAttendanceConfig } from '@/hooks/use-attendance';
import { DEFAULT_WEEK_OFF_RULE, describeWeekOff, isWeekOff } from '@/lib/week-off';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/use-permissions';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const eventSchema = z.object({
  title: z.string().min(1, 'Title required').max(200),
  description: z.string().max(2000).optional(),
  startDate: z.string().min(1, 'Start required'),
  endDate: z.string().min(1, 'End required'),
  isAllDay: z.boolean(),
  location: z.string().optional(),
  color: z.string().optional(),
});
type EventFormValues = z.infer<typeof eventSchema>;

const COLOR_OPTIONS = [
  { value: '#6366f1', label: 'Indigo' },
  { value: '#10b981', label: 'Green' },
  { value: '#ef4444', label: 'Red' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#8b5cf6', label: 'Purple' },
  { value: '#0ea5e9', label: 'Sky' },
];

function isoDate(d: Date): string {
  // Local-time YYYY-MM-DD (not UTC) so day boundaries match what the user sees.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function localDateInputValue(d: Date): string {
  // For <input type="datetime-local"> we need YYYY-MM-DDTHH:mm.
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CalendarPage(): ReactElement {
  const qc = useQueryClient();
  const { has } = usePermissions();
  const canManage = has('events.manage');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(isoDate(new Date()));
  const [editing, setEditing] = useState<CalendarEvent | 'new' | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch events for the visible 6-week grid (so events from prev/next-month
  // tail-days still light up).
  const gridStart = new Date(year, month, 1);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay()); // Sunday
  const gridEnd = new Date(gridStart);
  gridEnd.setDate(gridEnd.getDate() + 41);
  gridEnd.setHours(23, 59, 59, 999);

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ['calendar-events', gridStart.toISOString(), gridEnd.toISOString()],
    queryFn: () =>
      calendarApi.list({ start: gridStart.toISOString(), end: gridEnd.toISOString() }),
  });

  const create = useMutation({
    mutationFn: (input: CalendarEventInput) => calendarApi.create(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Event created');
      setEditing(null);
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Failed to create event');
    },
  });

  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<CalendarEventInput> }) =>
      calendarApi.update(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Event updated');
      setEditing(null);
    },
    onError: (e: { response?: { data?: { error?: { message?: string } } } }) => {
      toast.error(e.response?.data?.error?.message ?? 'Failed to update');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => calendarApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('Event deleted');
      setEditing(null);
    },
  });

  const events = eventsData?.data ?? [];

  // Company week-off rule — which Saturdays/Sundays are non-working.
  const { data: configData } = useAttendanceConfig();
  const weekOffRule = configData?.data?.weekOff ?? DEFAULT_WEEK_OFF_RULE;

  // Group events by their local YYYY-MM-DD (occupies every day in the range
  // for multi-day events).
  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of events) {
      const start = new Date(e.startDate);
      const end = new Date(e.endDate);
      const cur = new Date(start);
      cur.setHours(0, 0, 0, 0);
      const last = new Date(end);
      last.setHours(0, 0, 0, 0);
      while (cur <= last) {
        const key = isoDate(cur);
        (map[key] ??= []).push(e);
        cur.setDate(cur.getDate() + 1);
      }
    }
    return map;
  }, [events]);

  const calendarDays = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevDays = new Date(year, month, 0).getDate();
    const days: { date: string; day: number; isCurrentMonth: boolean; isOff: boolean }[] = [];
    // Week-offs come from the company rule (Attendance → Settings), so a
    // Saturday that is off this month but working the next is shaded
    // correctly instead of blanket-colouring every Saturday.
    const push = (date: Date, day: number, isCurrentMonth: boolean): void => {
      days.push({ date: isoDate(date), day, isCurrentMonth, isOff: isWeekOff(date, weekOffRule) });
    };

    for (let i = firstDay - 1; i >= 0; i--) {
      const d = prevDays - i;
      push(new Date(year, month - 1, d), d, false);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      push(new Date(year, month, d), d, true);
    }
    const remaining = 42 - days.length;
    for (let d = 1; d <= remaining; d++) {
      push(new Date(year, month + 1, d), d, false);
    }
    return days;
  }, [year, month, weekOffRule]);

  const today = isoDate(new Date());
  const dayEvents = eventsByDay[selectedDate] ?? [];

  const navigateMonth = (dir: -1 | 1): void => {
    setCurrentDate(new Date(year, month + dir, 1));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendar"
        description="Schedule events, meetings, and reminders"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Calendar' }]}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> Add Event
            </Button>
          ) : null
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => navigateMonth(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentDate(new Date());
                  setSelectedDate(today);
                }}
              >
                Today
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                onClick={() => navigateMonth(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-px">
            {DAYS.map((day) => (
              <div
                key={day}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-px">
            {calendarDays.map(({ date, day, isCurrentMonth, isOff }) => {
              const dots = (eventsByDay[date] ?? []).slice(0, 3);
              const isToday = date === today;
              const isSelected = date === selectedDate;
              return (
                <button
                  key={date}
                  onClick={() => setSelectedDate(date)}
                  title={isOff ? 'Week off — non-working day' : undefined}
                  className={cn(
                    'flex h-14 flex-col items-center justify-start rounded-md p-1 text-sm transition-colors',
                    !isCurrentMonth && 'text-muted-foreground/40',
                    isCurrentMonth && 'text-foreground hover:bg-muted',
                    // Week off — dark grey fill so non-working days read at a glance.
                    isOff && isCurrentMonth && 'bg-slate-300 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
                    isSelected && 'bg-primary/10 ring-1 ring-primary',
                    isToday && !isSelected && 'bg-muted font-bold',
                  )}
                >
                  <span
                    className={cn(
                      'flex size-7 items-center justify-center rounded-full text-xs',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {day}
                  </span>
                  {dots.length > 0 && (
                    <div className="mt-0.5 flex gap-0.5">
                      {dots.map((ev) => (
                        <div
                          key={ev._id}
                          className="size-1.5 rounded-full"
                          style={{ background: ev.color || '#6366f1' }}
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Colour codes — what the shading on the grid means. */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span className="font-medium uppercase tracking-wider">Colour codes</span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-slate-300 dark:bg-slate-700" />
              Week off ({describeWeekOff(weekOffRule)})
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-primary" />
              Today
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3 rounded bg-primary/10 ring-1 ring-primary" />
              Selected
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-indigo-500" />
              Event on this day
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-muted-foreground" />
            <h3 className="text-sm font-semibold">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              })}
            </h3>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : dayEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12 text-center">
              <CalendarDays className="mb-2 size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No events</p>
              {canManage && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => setEditing('new')}
                >
                  <Plus className="size-3" /> Add event
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {dayEvents.map((event) => (
                <button
                  key={event._id}
                  onClick={() => setEditing(event)}
                  className="block w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-muted/50"
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 size-2.5 shrink-0 rounded-full"
                      style={{ background: event.color || '#6366f1' }}
                    />
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-medium">{event.title}</p>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {event.isAllDay
                            ? 'All day'
                            : `${new Date(event.startDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${new Date(event.endDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`}
                        </span>
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="size-3" />
                            {event.location}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing && (
        <EventDialog
          editing={editing}
          selectedDate={selectedDate}
          readOnly={!canManage}
          onClose={() => setEditing(null)}
          onCreate={(values) => create.mutate(values)}
          onUpdate={(id, values) => update.mutate({ id, input: values })}
          onDelete={(id) => {
            if (confirm('Delete this event?')) remove.mutate(id);
          }}
          saving={create.isPending || update.isPending}
          deleting={remove.isPending}
        />
      )}
    </div>
  );
}

function EventDialog({
  editing,
  selectedDate,
  readOnly,
  onClose,
  onCreate,
  onUpdate,
  onDelete,
  saving,
  deleting,
}: {
  editing: CalendarEvent | 'new';
  selectedDate: string;
  /** View only — creating, editing and deleting events is `events.manage`. */
  readOnly: boolean;
  onClose: () => void;
  onCreate: (input: CalendarEventInput) => void;
  onUpdate: (id: string, input: Partial<CalendarEventInput>) => void;
  onDelete: (id: string) => void;
  saving: boolean;
  deleting: boolean;
}): ReactElement {
  const isNew = editing === 'new';

  const defaults = useMemo<EventFormValues>(() => {
    if (isNew) {
      const start = new Date(selectedDate + 'T09:00');
      const end = new Date(selectedDate + 'T10:00');
      return {
        title: '',
        description: '',
        startDate: localDateInputValue(start),
        endDate: localDateInputValue(end),
        isAllDay: false,
        location: '',
        color: '#6366f1',
      };
    }
    return {
      title: editing.title,
      description: editing.description ?? '',
      startDate: localDateInputValue(new Date(editing.startDate)),
      endDate: localDateInputValue(new Date(editing.endDate)),
      isAllDay: editing.isAllDay,
      location: editing.location ?? '',
      color: editing.color ?? '#6366f1',
    };
  }, [editing, isNew, selectedDate]);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema),
    defaultValues: defaults,
  });

  const isAllDay = watch('isAllDay');
  const color = watch('color');

  const onSubmit = (values: EventFormValues): void => {
    const payload: CalendarEventInput = {
      title: values.title,
      description: values.description || undefined,
      startDate: new Date(values.startDate).toISOString(),
      endDate: new Date(values.endDate).toISOString(),
      isAllDay: values.isAllDay,
      location: values.location || undefined,
      color: values.color,
    };
    if (isNew) {
      onCreate(payload);
    } else {
      onUpdate(editing._id, payload);
    }
  };

  return (
    <Dialog open={true} onClose={onClose} size="md">
      <DialogHeader>
        <DialogTitle>{readOnly ? 'Event' : isNew ? 'New event' : 'Edit event'}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogBody>
          <fieldset disabled={readOnly} className="space-y-4">
            <div>
              <Label htmlFor="ev-title">Title *</Label>
              <Input id="ev-title" placeholder="Team meeting" {...register('title')} />
              {errors.title && (
                <p className="mt-1 text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" {...register('isAllDay')} /> All-day event
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ev-start">Starts *</Label>
                <Input
                  id="ev-start"
                  type={isAllDay ? 'date' : 'datetime-local'}
                  {...register('startDate')}
                />
              </div>
              <div>
                <Label htmlFor="ev-end">Ends *</Label>
                <Input
                  id="ev-end"
                  type={isAllDay ? 'date' : 'datetime-local'}
                  {...register('endDate')}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ev-loc">Location</Label>
              <Input id="ev-loc" placeholder="Meeting room / Zoom link" {...register('location')} />
            </div>
            <div>
              <Label>Colour</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setValue('color', c.value)}
                    className={cn(
                      'size-7 rounded-full border-2 transition-all',
                      color === c.value
                        ? 'border-foreground scale-110'
                        : 'border-transparent hover:scale-105',
                    )}
                    style={{ background: c.value }}
                    title={c.label}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="ev-desc">Description</Label>
              <Textarea id="ev-desc" rows={3} {...register('description')} />
            </div>
          </fieldset>
        </DialogBody>
        <DialogFooter>
          {!readOnly && !isNew && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onDelete(editing._id)}
              loading={deleting}
              className="mr-auto text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-4" /> Delete
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {readOnly ? 'Close' : 'Cancel'}
          </Button>
          {!readOnly && (
            <Button type="submit" loading={saving}>
              {isNew ? 'Create' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </form>
    </Dialog>
  );
}
