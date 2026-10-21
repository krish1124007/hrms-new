import { forwardRef } from 'react';
import { Building2, Droplet, User } from 'lucide-react';
import { COMPANY_NAME } from '@/config/brand';
import type { IdCard } from '@/lib/id-cards.api';

function fmtMonthYear(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
}

/**
 * The company ID card — one design for everyone. Both "My ID card" and the HR
 * generator render the server's card payload through this component, so a
 * printed card and the on-screen card are the same, and the QR is the
 * server-signed one that verifies at `/verify/:code`.
 *
 * Plain colours (no theme tokens that flip in dark mode) because the HR page
 * captures it to PNG for printing.
 */
export const IdCardView = forwardRef<HTMLDivElement, { card: IdCard }>(function IdCardView(
  { card },
  ref,
) {
  return (
    <div
      ref={ref}
      data-testid="id-card"
      className="w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-sm"
      style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
    >
      {/* Header band */}
      <div className="flex flex-col items-center gap-1 bg-blue-700 px-4 py-3 text-center text-white">
        <div className="flex items-center gap-1.5">
          <Building2 className="size-4 shrink-0" />
          <span className="text-xs font-bold leading-tight tracking-wide">{COMPANY_NAME}</span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-[0.2em] opacity-90">
          Employee ID card
        </span>
      </div>

      <div className="flex flex-col items-center px-5 py-5">
        <div className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-slate-100">
          {card.profileImage ? (
            <img
              src={card.profileImage}
              alt={`${card.firstName} ${card.lastName}`}
              className="size-full object-cover"
            />
          ) : (
            <User className="size-9 text-slate-400" />
          )}
        </div>

        <p className="mt-3 text-center text-lg font-bold">
          {card.firstName} {card.lastName}
        </p>
        {card.designation && <p className="text-center text-sm text-slate-600">{card.designation}</p>}
        {card.department && <p className="text-center text-xs text-slate-500">{card.department}</p>}

        <div className="my-4 h-px w-full bg-slate-200" />

        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">Employee ID</p>
        <p className="font-mono text-base font-semibold tracking-widest">{card.employeeId}</p>

        {/* Server-rendered, signed QR. The white plate keeps the quiet zone. */}
        <div className="mt-4 rounded-lg bg-white p-1.5 ring-1 ring-slate-200">
          <img src={card.qr} alt={`QR code for ${card.employeeId}`} className="size-28" />
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-3 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Joined</p>
            <p className="text-xs font-medium">{fmtDate(card.joiningDate)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-slate-500">Valid until</p>
            <p className="text-xs font-medium">{fmtMonthYear(card.validUntil)}</p>
          </div>
        </div>

        {card.bloodGroup && (
          <span className="mt-3 inline-flex items-center gap-1 rounded-full border border-slate-300 px-2 py-0.5 text-xs">
            <Droplet className="size-3 text-red-500" /> {card.bloodGroup}
          </span>
        )}
      </div>
    </div>
  );
});
