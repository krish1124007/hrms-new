import type { ReactElement, ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarCheck, ChevronLeft, ChevronRight, ClipboardList, Clock, MapPin, Smartphone } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { VisitFlagBadges, VisitStatusBadge } from '@/components/field/FieldBits';
import { useMyDay } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { apiErrorMessage, isNoEmployeeProfileError } from '@/lib/api-error';
import { addDaysToKey } from '@/lib/business-day';
import type { FieldTask, Visit } from '@/lib/field.api';
import { formatMinutes } from '@/lib/field-visits';
import { formatDate, formatTime, todayIST } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

function VisitRow({ v }: { v: Visit }): ReactElement {
  return (
    <li>
      <Link to={`/field/visits/${v._id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-muted/40">
        <span className="min-w-0">
          <span className="block truncate font-medium">{v.site?.name ?? 'Site'}</span>
          <span className="block text-xs text-muted-foreground">
            {v.purpose}
            {v.checkIn?.at ? ` · ${formatTime(v.checkIn.at)} – ${v.checkOut?.at ? formatTime(v.checkOut.at) : 'now'}` : ''}
            {v.durationMinutes != null ? ` · ${formatMinutes(v.durationMinutes)}` : ''}
          </span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <VisitFlagBadges flags={v.flags} />
          <VisitStatusBadge status={v.status} />
        </span>
      </Link>
    </li>
  );
}

function Group({ title, icon: Icon, count, children, empty }: { title: string; icon: typeof MapPin; count: number; children: ReactNode; empty: string }): ReactElement {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
          {title}
        </CardTitle>
        <Badge variant="secondary">{count}</Badge>
      </CardHeader>
      <CardContent className="p-0">
        {count === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border border-t border-border">{children}</ul>
        )}
      </CardContent>
    </Card>
  );
}

function TaskRow({ t }: { t: FieldTask }): ReactElement {
  const site = typeof t.siteId === 'object' && t.siteId ? t.siteId.name : null;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
      <span className="min-w-0">
        <span className="block truncate font-medium">{t.title}</span>
        <span className="block text-xs text-muted-foreground">
          {site ? `${site} · ` : ''}
          {t.dueDate ? `due ${formatDate(t.dueDate)}` : 'no due date'}
        </span>
      </span>
      <Badge variant={t.status === 'completed' ? 'success' : 'secondary'}>{t.status.replace('_', ' ')}</Badge>
    </li>
  );
}

/** The signed-in employee's field day: what is planned, open, done and missed, and their tasks. */
export default function MyDayPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const raw = params.get('date') ?? '';
  const date = DATE_KEY.test(raw) ? raw : today;
  const setDate = (d: string): void => {
    const next = new URLSearchParams(params);
    if (!d || d === today) next.delete('date');
    else next.set('date', d);
    setParams(next, { replace: true });
  };
  const { noProfile, isLoading: profileLoading } = useMyEmployeeProfile();
  const { data, isLoading, error } = useMyDay(date, { enabled: !noProfile });
  const day = data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My day"
        description="Your visits and tasks for the day. Check in and out at sites from the mobile app."
        icon={CalendarCheck}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'My day' }]}
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDaysToKey(date, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input type="date" aria-label="Day" className="w-40" value={date} onChange={(e) => setDate(e.target.value)} />
            <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDate(addDaysToKey(date, 1))}>
              <ChevronRight className="size-4" />
            </Button>
          </div>
        }
      />

      {noProfile || isNoEmployeeProfileError(error) ? (
        <NoEmployeeProfileNotice feature="field day" />
      ) : isLoading || profileLoading ? (
        <Skeleton className="h-72 w-full" />
      ) : error || !day ? (
        <EmptyState icon={CalendarCheck} title="Couldn't load your day" description={apiErrorMessage(error)} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border bg-card px-4 py-3 text-sm">
            <span className="flex items-center gap-1.5">
              <Clock className="size-4 text-muted-foreground" />
              Attendance {formatDate(`${date}T12:00:00+05:30`)}:
            </span>
            <span>
              In <strong>{day.attendance?.checkedInAt ? formatTime(day.attendance.checkedInAt) : '—'}</strong>
            </span>
            <span>
              Out <strong>{day.attendance?.checkedOutAt ? formatTime(day.attendance.checkedOutAt) : '—'}</strong>
            </span>
            <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
              <Smartphone className="size-3.5" />
              Visits are checked in and out from the mobile app.
            </span>
          </div>

          {day.inProgress && (
            <Card className="border-warning/50">
              <CardHeader className="py-3">
                <CardTitle className="text-base">At a site now</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="border-t border-border">
                  <VisitRow v={day.inProgress} />
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Group title="Planned" icon={MapPin} count={day.planned.length} empty="Nothing planned for this day.">
              {day.planned.map((v) => (
                <VisitRow key={v._id} v={v} />
              ))}
            </Group>
            <Group title="Done" icon={CalendarCheck} count={day.completed.length} empty="No visits completed yet.">
              {day.completed.map((v) => (
                <VisitRow key={v._id} v={v} />
              ))}
            </Group>
            <Group title="Missed" icon={MapPin} count={day.missed.length} empty="No missed visits.">
              {day.missed.map((v) => (
                <VisitRow key={v._id} v={v} />
              ))}
            </Group>
            <Group title="Tasks" icon={ClipboardList} count={day.tasks.length} empty="No open tasks.">
              {day.tasks.map((t) => (
                <TaskRow key={t._id} t={t} />
              ))}
            </Group>
          </div>
          <Link to="/field/tasks" className="inline-block text-sm font-medium text-primary hover:underline">
            All my tasks
          </Link>
        </>
      )}
    </div>
  );
}
