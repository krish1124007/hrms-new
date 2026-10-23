import { useMemo, useState, type ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Bike, ChevronLeft, ChevronRight, Route, RotateCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { NoEmployeeProfileNotice } from '@/components/common/NoEmployeeProfile';
import { EstimatedBadge } from '@/components/field/RouteMap';
import { useCreateTravelClaim, useFieldVehicles, useTravelDay } from '@/hooks/use-field-reports';
import { useMyEmployeeProfile } from '@/hooks/use-my-profile';
import type { FieldVehicle, TravelClaimInput, TravelDay } from '@/lib/field-reports.api';
import { routeLink } from '@/lib/field-links';
import { formatKm, formatRupees, isRouteEstimated, kmNeedsReason, travelAmount } from '@/lib/field-route';
import { addDaysToKey } from '@/lib/business-day';
import { apiErrorMessage } from '@/lib/api-error';
import { formatDate, todayIST } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const dayLabel = (date: string): string => formatDate(`${date}T12:00:00+05:30`);

const CLAIM_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
  draft: 'secondary',
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  reimbursed: 'default',
};

/** An employee's travel allowance: the day's km from their check-in/out points, claimed by vehicle. */
export default function TravelClaimsPage(): ReactElement {
  const [params, setParams] = useSearchParams();
  const today = todayIST();
  const rawDate = params.get('date') ?? '';
  const date = DATE_KEY.test(rawDate) && rawDate <= today ? rawDate : today;
  const setDate = (d: string): void => {
    const next = new URLSearchParams(params);
    next.set('date', d);
    setParams(next, { replace: true });
  };

  const { profile, noProfile, isLoading: profileLoading } = useMyEmployeeProfile();
  const travel = useTravelDay(date, !noProfile && !profileLoading);
  const vehicles = useFieldVehicles();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Travel allowance"
        description="Claim the km you travelled between check-ins on a day. Claims go to your approver like any other expense."
        icon={Bike}
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'Field Visits' }, { label: 'Travel allowance' }]}
      />

      <div className="space-y-1.5">
        <Label htmlFor="ta-date">Day</Label>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDaysToKey(date, -1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <Input
            id="ta-date"
            type="date"
            className="w-40"
            max={today}
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => setDate(addDaysToKey(date, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {profileLoading || travel.isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : noProfile ? (
        <NoEmployeeProfileNotice feature="travel allowance" />
      ) : travel.error ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load the day's travel"
          description={apiErrorMessage(travel.error)}
          action={
            <Button variant="outline" size="sm" onClick={() => void travel.refetch()}>
              <RotateCw className="size-4" /> Retry
            </Button>
          }
        />
      ) : travel.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <DistanceCard day={travel.data.data} employeeId={profile?._id} />
          <ClaimCard
            key={date}
            day={travel.data.data}
            vehicles={vehicles.data ?? []}
            vehiclesLoading={vehicles.isLoading}
            vehiclesError={vehicles.error}
          />
        </div>
      ) : null}
    </div>
  );
}

function DistanceCard({ day, employeeId }: { day: TravelDay; employeeId?: string }): ReactElement {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distance on {dayLabel(day.date)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          {formatKm(day.totalKm)}
          {isRouteEstimated(day) && <EstimatedBadge />}
        </div>
        <p className="text-sm text-muted-foreground">
          Measured between your day check-in, each visit&apos;s check-in and check-out, and your day check-out
          {day.legs.length ? ` (${day.legs.length} ${day.legs.length === 1 ? 'leg' : 'legs'})` : ''}.
        </p>
        {employeeId && (
          <Link
            to={routeLink(employeeId, day.date)}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <Route className="size-4" /> See the route
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

function ClaimCard({
  day,
  vehicles,
  vehiclesLoading,
  vehiclesError,
}: {
  day: TravelDay;
  vehicles: FieldVehicle[];
  vehiclesLoading: boolean;
  vehiclesError: unknown;
}): ReactElement {
  const claim = day.claim;
  if (claim && claim.status !== 'rejected') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Already claimed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Status</span>
            <Badge variant={CLAIM_VARIANT[claim.status] ?? 'secondary'}>{claim.status}</Badge>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-muted-foreground">Kilometres claimed</dt>
            <dd className="font-medium">{formatKm(claim.km)}</dd>
            <dt className="text-muted-foreground">Amount</dt>
            <dd className="font-medium">{formatRupees(claim.amount)}</dd>
          </dl>
          <p className="text-muted-foreground">
            One travel claim per day. Follow it in{' '}
            <Link to="/expense-claims" className="font-medium text-primary hover:underline">
              My expenses
            </Link>
            .
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!day.hasCompletedVisit) {
    return (
      <EmptyState
        icon={Bike}
        title="No completed visit on this day"
        description="Travel allowance is claimed for days with at least one completed site visit."
      />
    );
  }

  return (
    <TravelClaimForm
      day={day}
      vehicles={vehicles}
      vehiclesLoading={vehiclesLoading}
      vehiclesError={vehiclesError}
      rejected={claim?.status === 'rejected'}
    />
  );
}

function TravelClaimForm({
  day,
  vehicles,
  vehiclesLoading,
  vehiclesError,
  rejected,
}: {
  day: TravelDay;
  vehicles: FieldVehicle[];
  vehiclesLoading: boolean;
  vehiclesError: unknown;
  rejected: boolean;
}): ReactElement {
  const create = useCreateTravelClaim();
  const computed = day.totalKm;
  const [vehicleType, setVehicleType] = useState<string>(() => (vehicles.length === 1 ? vehicles[0].type : ''));
  const [km, setKm] = useState(() => String(round1(computed)));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  const vehicle = vehicles.find((v) => v.type === vehicleType);
  const claimed = km.trim() === '' ? Number.NaN : Number(km);
  const kmValid = Number.isFinite(claimed) && claimed >= 0;
  // Untouched (or only re-typed to the shown value) → the server's own calculation.
  const changed = kmValid && Math.abs(claimed - round1(computed)) >= 0.05;
  const needsReason = changed && kmNeedsReason(computed, claimed);
  const reasonMissing = needsReason && !reason.trim();
  const kmForAmount = changed ? claimed : computed;
  const amount = vehicle ? travelAmount(kmForAmount, vehicle.ratePerKm) : null;
  const canSubmit = !!vehicle && kmValid && !reasonMissing && !create.isPending;

  const payload = useMemo((): TravelClaimInput | null => {
    if (!vehicle) return null;
    const input: TravelClaimInput = { date: day.date, vehicleType: vehicle.type };
    if (changed) input.km = claimed;
    if (changed && reason.trim()) input.reason = reason.trim();
    return input;
  }, [vehicle, day.date, changed, claimed, reason]);

  const submit = (): void => {
    if (!payload) return;
    create.mutate(payload, { onSuccess: () => setConfirming(false), onError: () => setConfirming(false) });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Claim travel allowance</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {rejected && (
          <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
            Your earlier claim for this day was rejected. You can claim again.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ta-vehicle">Vehicle *</Label>
          <Select
            id="ta-vehicle"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value)}
            disabled={vehiclesLoading || vehicles.length === 0}
          >
            <option value="">{vehiclesLoading ? 'Loading…' : '— Select —'}</option>
            {vehicles.map((v) => (
              <option key={v.type} value={v.type}>
                {v.label} — {formatRupees(v.ratePerKm)}/km
              </option>
            ))}
          </Select>
          {!vehiclesLoading && vehicles.length === 0 && (
            <p className="text-xs text-destructive">
              {vehiclesError
                ? `Couldn't load the vehicle rates: ${apiErrorMessage(vehiclesError)}`
                : 'No vehicle rates are set up yet. Ask HR to add them in the field settings.'}
            </p>
          )}
          {vehicle && vehicle.ratePerKm === 0 && (
            <p className="text-xs text-warning">The rate for this vehicle is ₹0/km, so the claim would be ₹0.</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ta-km">Kilometres</Label>
          <Input
            id="ta-km"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.1"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            aria-invalid={!kmValid || reasonMissing}
          />
          {!kmValid ? (
            <p className="text-xs text-destructive">Enter the km travelled (0 or more).</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Calculated: {formatKm(computed)}. Change it only if the calculation is wrong; your approver sees both.
            </p>
          )}
        </div>

        {changed && (
          <div className="space-y-1.5">
            <Label htmlFor="ta-reason">Reason{needsReason ? ' *' : ''}</Label>
            <Textarea
              id="ta-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={reasonMissing}
              placeholder="Why the km differs from the calculation"
            />
            {needsReason && (
              <p className={reasonMissing ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
                The km differs from the calculated {formatKm(computed)} by more than 5 %, so a reason is required.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
          <span className="text-sm text-muted-foreground">Amount</span>
          <span className="text-lg font-semibold" data-testid="claim-amount">
            {amount === null ? '—' : formatRupees(amount)}
          </span>
        </div>

        <Button className="w-full" disabled={!canSubmit} onClick={() => setConfirming(true)}>
          Submit claim
        </Button>
      </CardContent>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={submit}
        loading={create.isPending}
        destructive={false}
        title="Submit travel claim?"
        confirmLabel="Submit"
        description={
          vehicle && amount !== null
            ? `${formatKm(kmForAmount)} by ${vehicle.label} at ${formatRupees(vehicle.ratePerKm)}/km = ${formatRupees(amount)} for ${dayLabel(day.date)}. Only one travel claim is allowed per day.`
            : undefined
        }
      />
    </Card>
  );
}
