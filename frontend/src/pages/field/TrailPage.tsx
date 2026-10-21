import { useEffect, type ReactElement } from 'react';
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
import { TrailMap } from '@/components/field/TrailMap';
import { useCanManageField, useFieldReps, useTrail } from '@/hooks/use-field';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import { usePermissions } from '@/hooks/use-permissions';
import { addDaysToKey } from '@/lib/business-day';
import { apiErrorCode, apiErrorMessage } from '@/lib/api-error';
import { formatDate, todayIST } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A rep's route and visits for one IST day, replayable. */
export default function TrailPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const canManage = useCanManageField();
  const { has } = usePermissions();
  const canPick = canManage && has('employees.view');
  const { data: reps = [] } = useFieldReps(canPick);
  const { profile, noProfile, isLoading: profileLoading } = useMyEmployeeProfile();

  const today = todayIST();
  const rawDate = params.get('date') ?? '';
  const date = DATE_KEY.test(rawDate) && rawDate <= today ? rawDate : today;
  const employeeId = params.get('employeeId') ?? '';

  const set = (patch: Record<string, string>): void => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setParams(next, { replace: true });
  };

  // A rep opens on their own trail.
  useEffect(() => {
    if (!employeeId && !canPick && profile?._id) set({ employeeId: profile._id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeId, canPick, profile?._id]);

  const trail = useTrail(employeeId || undefined, date);
  const code = apiErrorCode(trail.error);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trail"
        description="Where a rep went on a day (IST) and the visits they made — press play to replay it"
        icon={Route}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Sales', to: '/field' }, { label: 'Trail' }]}
      />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 py-4">
          <div className="min-w-[220px] flex-1 space-y-1.5">
            <Label htmlFor="trail-rep">Rep</Label>
            {canPick ? (
              <Select id="trail-rep" value={employeeId} onChange={(e) => set({ employeeId: e.target.value })}>
                <option value="">— Select a rep —</option>
                {reps.map((r) => (
                  <option key={r._id} value={r._id}>
                    {r.firstName} {r.lastName}
                    {r.employeeId ? ` (${r.employeeId})` : ''}
                  </option>
                ))}
              </Select>
            ) : (
              <div id="trail-rep" className="flex h-10 items-center rounded-md border border-input px-3 text-sm">
                {trail.data?.data.name ??
                  (profile && employeeId === profile._id ? `${profile.firstName} ${profile.lastName} (you)` : '—')}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="trail-date">Day</Label>
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
                id="trail-date"
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
        profileLoading && !canPick ? (
          <Skeleton className="h-96 w-full" />
        ) : noProfile && !canPick ? (
          <NoEmployeeProfileNotice feature="trail" />
        ) : (
          <EmptyState icon={Route} title="Pick a rep" description="Choose a rep and a day to see their route." />
        )
      ) : trail.isLoading ? (
        <Skeleton className="h-[520px] w-full" />
      ) : trail.error ? (
        <EmptyState
          icon={Route}
          title={code === 'NOT_YOUR_REPORT' ? 'Not one of your reps' : "Couldn't load the trail"}
          description={
            code === 'NOT_YOUR_REPORT'
              ? 'You can see your own trail and the trails of people who report to you.'
              : apiErrorMessage(trail.error)
          }
        />
      ) : trail.data && trail.data.data.points.length === 0 && trail.data.data.visits.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Nothing recorded"
          description={`${trail.data.data.name} has no locations or visits on ${formatDate(`${date}T12:00:00+05:30`)}.`}
        />
      ) : trail.data ? (
        <TrailMap trail={trail.data.data} />
      ) : null}
    </div>
  );
}
