import type { ReactElement } from 'react';
import { Link } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { usePermissions } from '@/hooks/use-permissions';
import type { ExpenseTravel } from '@/lib/expense-claims.api';
import { visitLink } from '@/lib/field-links';
import { VEHICLE_LABEL, formatKm, formatRupees, kmNeedsReason, travelAmount, travelSites } from '@/lib/field-route';
import { formatDate } from '@/lib/format';
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
 * the calculated km (and whether it is an estimate) beside the claimed km,
 * the vehicle and its rate, the sites the measured route went through, and
 * the employee's reason for any correction.
 */
export function TravelBreakdown({ travel, className }: { travel: ExpenseTravel; className?: string }): ReactElement {
  const diff = kmDifference(travel.computedKm, travel.claimedKm);
  const overTolerance = kmNeedsReason(travel.computedKm, travel.claimedKm);
  // The sites the measured day went through, in order.
  const stops = travelSites(travel.points);
  return (
    <dl
      data-testid="travel-breakdown"
      className={cn('grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-md border border-border p-3 text-sm', className)}
    >
      <dt className="text-muted-foreground">Day</dt>
      <dd>{formatDate(`${travel.date}T12:00:00+05:30`)}</dd>
      <dt className="text-muted-foreground">Vehicle</dt>
      <dd>{VEHICLE_LABEL[travel.vehicleType]}</dd>
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
      <dt className="text-muted-foreground">Route</dt>
      <dd>
        {stops.length > 0 ? stops.join(' → ') : 'No site check-ins with GPS'}
        <span className="ml-1 text-xs text-muted-foreground">
          ({travel.points.length} {travel.points.length === 1 ? 'point' : 'points'}, {travel.legs.length}{' '}
          {travel.legs.length === 1 ? 'leg' : 'legs'})
        </span>
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

/**
 * The field visit an expense is linked to. With field access it links to the
 * visit; an approver without it (the visit page would refuse them) sees what
 * the claim itself tells — the expense day and, for travel, the sites on the
 * route. The server sends only the visit's id, so nothing more is known here.
 */
export function LinkedVisit({
  visitId,
  date,
  sites = [],
}: {
  visitId: string;
  /** The expense's day. */
  date?: string;
  /** Sites the claim names (a travel claim's route). */
  sites?: string[];
}): ReactElement {
  const { hasAny } = usePermissions();
  const canOpen = hasAny(['field.view', 'field.manage']);
  return (
    <div className="flex items-center gap-2 text-sm" data-testid="linked-visit">
      <MapPin className="size-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">Linked visit:</span>
      {canOpen ? (
        <Link to={visitLink(visitId)} className="font-medium text-primary hover:underline">
          View visit
        </Link>
      ) : (
        <span>
          Field visit{date ? ` · expense of ${formatDate(date)}` : ''}
          {sites.length > 0 ? ` · ${sites.join(' → ')}` : ''}
        </span>
      )}
    </div>
  );
}
