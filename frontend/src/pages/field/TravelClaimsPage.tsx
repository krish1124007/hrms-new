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
import type { ExpenseClaimStatus } from '@/lib/expense-claims.api';
import type { FieldVehicle, TravelClaimInput, TravelDay } from '@/lib/field-reports.api';
import { routeLink } from '@/lib/field-links';
import { formatKm, formatRupees, kmNeedsReason, travelAmount } from '@/lib/field-route';
import { addDaysToKey } from '@/lib/business-day';
import { apiErrorMessage } from '@/lib/api-error';
import { formatDate, todayIST } from '@/lib/format';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

const round1 = (n: number): number => Math.round(n * 10) / 10;
const dayLabel = (date: string): string => formatDate(`${date}T12:00:00+05:30`);
/** The server refuses a claim for a vehicle without a rate (it would come to ₹0). */
const hasRate = (v: FieldVehicle): boolean => v.ratePerKm > 0;
/** The most km the server accepts for one day. */
const MAX_CLAIM_KM = 5000;

const CLAIM_VARIANT: Record<ExpenseClaimStatus, 'success' | 'warning' | 'destructive' | 'secondary' | 'default'> = {
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
          {day.estimated && <EstimatedBadge />}
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
            <Badge variant={CLAIM_VARIANT[claim.status]}>{claim.status}</Badge>
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

  // Every vehicle at ₹0/km: any claim would be ₹0, which the server refuses.
  if (!vehiclesLoading && !vehiclesError && vehicles.length > 0 && !vehicles.some(hasRate)) {
    return (
      <EmptyState
        icon={Bike}
        title="Vehicle rates are not set yet"
        description="No vehicle has a rate per km, so a claim would come to ₹0. Ask HR to set the vehicle rates in Field settings, then claim this day."
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
  const rated = vehicles.filter(hasRate);
  const unrated = vehicles.filter((v) => !hasRate(v));
  const [vehicleType, setVehicleType] = useState<string>(() => (rated.length === 1 ? rated[0].type : ''));
  const [km, setKm] = useState(() => String(round1(computed)));
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Only a vehicle with a rate can be claimed for (the server answers VEHICLE_RATE_NOT_SET otherwise).
  const vehicle = rated.find((v) => v.type === vehicleType);
  const claimed = km.trim() === '' ? Number.NaN : Number(km);
  const kmValid = Number.isFinite(claimed) && claimed >= 0 && claimed <= MAX_CLAIM_KM;
  // Untouched (or only re-typed to the shown value) → the server's own calculation.
  const changed = kmValid && Math.abs(claimed - round1(computed)) >= 0.05;
  const needsReason = changed && kmNeedsReason(computed, claimed);
  const reasonMissing = needsReason && !reason.trim();
  const kmForAmount = changed ? claimed : computed;
  const amount = vehicle && kmValid ? travelAmount(kmForAmount, vehicle.ratePerKm) : null;
  // A ₹0 claim is refused by the server (NOTHING_TO_CLAIM) — never offer it.
  const nothingToClaim = amount === 0;
  const canSubmit = !!vehicle && kmValid && !reasonMissing && !nothingToClaim && !create.isPending;

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
              <option key={v.type} value={v.type} disabled={!hasRate(v)}>
                {v.label} — {hasRate(v) ? `${formatRupees(v.ratePerKm)}/km` : 'rate not set'}
              </option>
            ))}
          </Select>
          {!vehiclesLoading && vehicles.length === 0 && (
            <p className="text-xs text-destructive">
              {vehiclesError
                ? `Couldn't load the vehicle rates: ${apiErrorMessage(vehiclesError)}`
                : 'No vehicles are set up yet. Ask HR to add them, with a rate per km, in Field settings.'}
            </p>
          )}
          {unrated.length > 0 && rated.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="unrated-vehicles">
              No rate per km is set for {unrated.map((v) => v.label).join(', ')}, so {unrated.length === 1 ? 'it' : 'they'}{' '}
              can&apos;t be claimed. Ask HR to set the rate in Field settings.
            </p>
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
            <p className="text-xs text-destructive">
              Enter the km travelled (0 to {MAX_CLAIM_KM.toLocaleString('en-IN')}).
            </p>
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
        {nothingToClaim && vehicle && (
          <p role="alert" className="text-sm text-destructive">
            {formatKm(kmForAmount)} at {formatRupees(vehicle.ratePerKm)}/km comes to ₹0, so there is nothing to claim.
          </p>
        )}

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
