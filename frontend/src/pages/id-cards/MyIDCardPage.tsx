import { type ReactElement } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Droplet, User } from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';
import { idCardsApi } from '@/lib/id-cards.api';

const COMPANY_NAME = 'DD HRMS';

/**
 * One card design, company-wide. The alternative styles were dropped so every
 * employee's card looks identical — a guard checking IDs should not have to
 * recognise four different layouts. The design has no visible name.
 */
const CARD_BAND = 'bg-primary text-primary-foreground';

function fmtMonthYear(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * The signed-in employee's own ID card — display only, nothing to download.
 *
 * Everything comes from `/id-cards/my`, which takes no id and resolves the
 * employee from the session, so this page cannot show anyone else's card.
 */
export default function MyIDCardPage(): ReactElement {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['id-card', 'my'],
    queryFn: () => idCardsApi.my(),
  });
  const card = data?.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My ID card"
        description="Your employee identification — show this screen when asked"
        breadcrumbs={[{ label: 'Home', to: '/dashboard' }, { label: 'My ID card' }]}
      />

      {isLoading ? (
        <Skeleton className="mx-auto h-[440px] w-full max-w-sm rounded-2xl" />
      ) : isError || !card ? (
        <EmptyState
          icon={User}
          title="Card unavailable"
          description="We could not load your ID card. This usually means your login is not linked to an employee profile yet — please contact HR."
        />
      ) : (
        <div className="mx-auto w-full max-w-sm space-y-3">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            {/* Header band */}
            <div className={cn('flex flex-col items-center gap-1 px-6 py-4', CARD_BAND)}>
              <div className="flex items-center gap-2">
                <Building2 className="size-4" />
                <span className="text-sm font-bold tracking-wide">{COMPANY_NAME}</span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-90">
                Employee ID card
              </span>
            </div>

            <div className="flex flex-col items-center px-6 py-6">
              <div className="flex size-24 items-center justify-center overflow-hidden rounded-full bg-muted">
                {card.profileImage ? (
                  <img
                    src={card.profileImage}
                    alt={`${card.firstName} ${card.lastName}`}
                    className="size-full object-cover"
                  />
                ) : (
                  <User className="size-10 text-muted-foreground" />
                )}
              </div>

              <p className="mt-3 text-center text-lg font-bold text-foreground">
                {card.firstName} {card.lastName}
              </p>
              {card.designation && (
                <p className="text-center text-sm text-muted-foreground">{card.designation}</p>
              )}
              {card.department && (
                <p className="text-center text-xs text-muted-foreground">{card.department}</p>
              )}

              <div className="my-5 h-px w-full bg-border" />

              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Employee ID
              </p>
              <p className="font-mono text-lg font-semibold tracking-widest text-foreground">
                {card.employeeId}
              </p>

              {/* Real, scannable QR rendered by the server. The white plate keeps
                  the quiet zone intact in dark mode, or it will not scan. */}
              <div className="mt-5 rounded-lg bg-white p-2">
                <img src={card.qr} alt={`QR code for ${card.employeeId}`} className="size-32" />
              </div>

              <div className="mt-5 grid w-full grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Joined
                  </p>
                  <p className="text-xs font-medium text-foreground">{fmtDate(card.joiningDate)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Valid until
                  </p>
                  <p className="text-xs font-medium text-foreground">
                    {fmtMonthYear(card.validUntil)}
                  </p>
                </div>
              </div>

              {card.bloodGroup && (
                <Badge variant="outline" className="mt-4 gap-1">
                  <Droplet className="size-3" /> {card.bloodGroup}
                </Badge>
              )}
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            This card is issued to you and shows your details only.
          </p>
        </div>
      )}
    </div>
  );
}
