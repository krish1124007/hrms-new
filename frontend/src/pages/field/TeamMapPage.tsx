import { useMemo, useState, type ReactElement } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, RotateCw, Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { TeamMap } from '@/components/field/TeamMap';
import { useTeamStatus } from '@/hooks/use-field-reports';
import type { TeamMemberStatus } from '@/lib/field-reports.api';
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from '@/lib/api-error';
import { addDaysToKey } from '@/lib/business-day';
import { formatTime, todayIST } from '@/lib/format';

const COUNT_LABEL: Array<{ status: TeamMemberStatus; label: string }> = [
  { status: 'at_site', label: 'At a site' },
  { status: 'between_sites', label: 'Between sites' },
  { status: 'day_ended', label: 'Day ended' },
  { status: 'not_started', label: 'Not started' },
];

/** The team's status and last check-in/out point on a day — refreshed every minute for today. */
export default function TeamMapPage(): ReactElement {
  // `null` follows the clock: a map left open past midnight IST moves on to
  // the new day (each minute's refresh re-renders the page) and keeps polling.
  const today = todayIST();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const isToday = date === today;
  const setDate = (key: string): void => setPicked(key >= today ? null : key);
  const { data, isLoading, error, refetch, isFetching, dataUpdatedAt } = useTeamStatus(date, { poll: isToday });
  const rows = useMemo(() => data?.data ?? [], [data]);

  const counts = useMemo(() => {
    const c: Partial<Record<TeamMemberStatus, number>> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team map"
        description="Where each person last checked in or out, and what they are doing now"
        icon={Users}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Team map' }]}
      />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="team-date">Day</Label>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDaysToKey(date, -1))}>
              <ChevronLeft className="size-4" />
            </Button>
            <Input
              id="team-date"
              type="date"
              className="w-40"
              max={today}
              value={date}
              onChange={(e) => setDate(e.target.value && e.target.value <= today ? e.target.value : today)}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Next day"
              disabled={isToday}
              onClick={() => setDate(addDaysToKey(date, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {COUNT_LABEL.map(({ status, label }) => (
            <Badge key={status} variant="outline">
              {label}: {counts[status] ?? 0}
            </Badge>
          ))}
          {dataUpdatedAt > 0 && (
            <span>
              Updated {formatTime(dataUpdatedAt)}
              {isToday ? ' · refreshes every minute' : ''}
            </span>
          )}
          <Button variant="ghost" size="sm" onClick={() => void refetch()} loading={isFetching} aria-label="Refresh">
            {!isFetching && <RotateCw className="size-4" />}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : error && !data ? (
        apiErrorCode(error) === 'NO_EMPLOYEE_PROFILE' ? (
          <NoEmployeeProfileNotice feature="team map" />
        ) : (
          <EmptyState
            icon={AlertTriangle}
            title={apiErrorStatus(error) === 403 ? "You don't have access to the team map" : "Couldn't load the team"}
            description={apiErrorMessage(error)}
            action={
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                <RotateCw className="size-4" /> Retry
              </Button>
            }
          />
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No one to show"
          description="The team map lists you and the people who report to you (everyone, with field management access). Nobody in that list has a field record yet."
        />
      ) : (
        <TeamMap rows={rows} date={date} />
      )}
    </div>
  );
}
