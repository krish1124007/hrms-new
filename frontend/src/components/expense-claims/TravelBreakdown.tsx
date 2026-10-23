import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { ExpenseTravel, ExpenseVisitRef } from '@/lib/expense-claims.api';
import { visitLink } from '@/lib/field-links';
import { VEHICLE_LABEL, formatKm, formatRupees, travelAmount } from '@/lib/field-route';
import { formatDate, formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

/** `+18 %` / `−4 %` — how far the claimed km is from the calculation. */
function kmDifference(computedKm: number, claimedKm: number): string | null {
  if (Math.abs(claimedKm - computedKm) < 0.05) return null;
  if (computedKm <= 0) return 'nothing calculated';
  const pct = Math.round(((claimedKm - computedKm) / computedKm) * 100);
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct)} %`;
}

/**
 * How a travel allowance claim was worked out — what the approver checks:
 * the calculated km beside the claimed km, the rate, and the employee's
 * reason for any correction.
 */
export function TravelBreakdown({ travel, className }: { travel: ExpenseTravel; className?: string }): ReactElement {
  const diff = kmDifference(travel.computedKm, travel.claimedKm);
  const overTolerance =
    travel.computedKm > 0 ? Math.abs(travel.claimedKm - travel.computedKm) / travel.computedKm > 0.05 : !!diff;
  return (
    <dl
      data-testid="travel-breakdown"
      className={cn('grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-border p-3 text-sm', className)}
    >
      <dt className="text-muted-foreground">Day</dt>
      <dd>{formatDate(`${travel.date.slice(0, 10)}T12:00:00+05:30`)}</dd>
      <dt className="text-muted-foreground">Vehicle</dt>
      <dd>{VEHICLE_LABEL[travel.vehicleType] ?? travel.vehicleType}</dd>
      <dt className="text-muted-foreground">Rate</dt>
      <dd>{formatRupees(travel.ratePerKm)} / km</dd>
      <dt className="text-muted-foreground">Calculated</dt>
      <dd className="flex flex-wrap items-center gap-2">
        {formatKm(travel.computedKm)}
        {travel.estimated && (
          <Badge variant="warning" title="Road distance was unavailable, so this is the straight-line distance × 1.3">
            Estimated
          </Badge>
        )}
      </dd>
      <dt className="text-muted-foreground">Claimed</dt>
      <dd className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{formatKm(travel.claimedKm)}</span>
        {diff && <span className={cn('text-xs', overTolerance ? 'text-warning' : 'text-muted-foreground')}>{diff}</span>}
      </dd>
      <dt className="text-muted-foreground">Reason</dt>
      <dd className="whitespace-pre-line">{travel.reason?.trim() || '—'}</dd>
      <dt className="text-muted-foreground">Amount</dt>
      <dd className="font-medium">
        {formatRupees(travelAmount(travel.claimedKm, travel.ratePerKm))}{' '}
        <span className="text-xs font-normal text-muted-foreground">
          ({formatKm(travel.claimedKm)} × {formatRupees(travel.ratePerKm)})
        </span>
      </dd>
    </dl>
  );
}

/** The field visit an expense is linked to, as a link to the visit. */
export function LinkedVisit({ visit }: { visit: ExpenseVisitRef }): ReactElement {
  const id = typeof visit === 'string' ? visit : visit._id;
  const site = typeof visit === 'string' ? null : visit.site?.name;
  const at = typeof visit === 'string' ? null : visit.checkIn?.at;
  return (
    <div className="flex items-center gap-2 text-sm">
      <MapPin className="size-4 text-muted-foreground" />
      <span className="text-muted-foreground">Linked visit:</span>
      <Link to={visitLink(id)} className="font-medium text-primary hover:underline">
        {site ?? 'View visit'}
      </Link>
      {at && <span className="text-xs text-muted-foreground">{formatDateTime(at)}</span>}
    </div>
  );
}
