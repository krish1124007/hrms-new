import { useEffect, useMemo, type ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Route } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { RouteMap } from '@/components/field/RouteMap';
import { useDayRoute, useTeamStatus } from '@/hooks/use-field-reports';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { addDaysToKey } from '@/lib/business-day';
import { apiErrorCode, apiErrorMessage, apiErrorStatus } from '@/lib/api-error';
import { formatDate, todayIST } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_IN_SCOPE = new Set(['NOT_YOUR_REPORT', 'FORBIDDEN', 'OUT_OF_SCOPE']);

/** One person's check-in/out points on an IST day, the legs between them and the km. */
export default function RoutePage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const rawDate = params.get('date') ?? '';
  const date = DATE_KEY.test(rawDate) && rawDate <= today ? rawDate : today;
  const employeeId = params.get('employeeId') ?? '';

  const { profile, noProfile, isLoading: profileLoading } = useMyEmployeeProfile();
  // The people this user may see (self + reports, or everyone) — the picker's source.
  const team = useTeamStatus(today);
  const people = useMemo(
    () =>
      (team.data?.data ?? [])
        .map((r) => r.employee)
        .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)),
    [team.data],
  );

  const set = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // Open on the user's own route, or on the only person they can see.
  useEffect(() => {
    if (employeeId) return;
    if (profile?._id) set({ employeeId: profile._id });
    else if (people.length === 1) set({ employeeId: people[0]._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, profile?._id, people]);

  const route = useDayRoute(employeeId || undefined, date);
  const code = apiErrorCode(route.error);
  const selected = people.find((p) => p._id === employeeId);
  const name = selected
    ? `${selected.firstName} ${selected.lastName}`
    : profile && employeeId === profile._id
      ? `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'You'
      : 'This person';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Day route"
        description="Check-in and check-out points of a day (IST), the distance between them and the day's km"
        icon={Route}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Routes' }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="route-employee">Employee</Label>
            {people.length > 1 ? (
              <Select id="route-employee" value={employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
                <option value="">— Select an employee —</option>
                {employeeId && !selected && <option value={employeeId}>{name}</option>}
                {people.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.firstName} {p.lastName}
                    {p.employeeId ? ` (${p.employeeId})` : ''}
                    {p._id === profile?._id ? ' — you' : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <div id="route-employee" className="flex h-10 items-center rounded-md border border-input px-3 text-sm">
                {employeeId ? name : '—'}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="route-date">Day</Label>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Previous day"
                onClick={() => set({ date: addDaysToKey(date, -1) })}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Input
                id="route-date"
                type="date"
                className="w-40"
                max={today}
                value={date}
                onChange={(e) => set({ date: e.target.value })}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Next day"
                disabled={date >= today}
                onClick={() => set({ date: addDaysToKey(date, 1) })}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!employeeId ? (
        profileLoading || team.isLoading ? (
          <Skeleton className="h-96 w-full" />
        ) : noProfile && people.length === 0 ? (
          <NoEmployeeProfileNotice feature="route" />
        ) : (
          <EmptyState icon={Route} title="Pick an employee" description="Choose someone and a day to see their route." />
        )
      ) : route.isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : route.error ? (
        <EmptyState
          icon={Route}
          title={
            NOT_IN_SCOPE.has(code ?? '') || apiErrorStatus(route.error) === 403
              ? 'Not one of your team'
              : "Couldn't load the route"
          }
          description={
            NOT_IN_SCOPE.has(code ?? '') || apiErrorStatus(route.error) === 403
              ? 'You can see your own route and the routes of people who report to you.'
              : apiErrorMessage(route.error)
          }
        />
      ) : route.data && route.data.data.points.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nothing recorded"
          description={`${name} has no check-ins or check-outs on ${formatDate(`${date}T12:00:00+05:30`)}.`}
        />
      ) : route.data ? (
        <RouteMap route={route.data.data} />
      ) : null}
    </div>
  );
}
