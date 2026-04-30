import i18n from '../i18n';

/**
 * Locale-aware formatters. All use the browser's `Intl` so they honour
 * the active i18n language, plus the tenant's configured currency /
 * timezone (passed in from `useAuth().tenant.settings`).
 *
 * Always prefer these over hand-rolled `toLocaleString()` calls — they
 * make the locale source explicit, fall back gracefully, and give us a
 * single place to tweak when a finance team asks for a format change.
 */

function currentLocale(): string {
  // i18next stores the resolved language, not the raw `navigator.language`
  return i18n.resolvedLanguage ?? i18n.language ?? 'en';
}

/* ─────────── Numbers ─────────── */

export function formatNumber(
  value: number,
  options: Intl.NumberFormatOptions & { locale?: string } = {},
): string {
  const { locale, ...opts } = options;
  return new Intl.NumberFormat(locale ?? currentLocale(), opts).format(value);
}

/* ─────────── Currency ─────────── */

/**
 * Format an amount in the tenant's currency. If the tenant's currency
 * isn't provided, defaults to INR (our primary market) — never to USD,
 * because showing `$X` to an Indian user is confusing.
 */
export function formatCurrency(
  amount: number,
  opts: { currency?: string; locale?: string; compact?: boolean } = {},
): string {
  const currency = opts.currency ?? 'INR';
  const locale = opts.locale ?? currentLocale();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      // Compact form (₹1.2L / ₹3.4M) for dashboards; full form on invoices.
      notation: opts.compact ? 'compact' : 'standard',
      maximumFractionDigits: opts.compact ? 1 : 2,
    }).format(amount);
  } catch {
    // Unknown currency — fall back to plain number formatting
    return `${currency} ${formatNumber(amount, { locale })}`;
  }
}

/* ─────────── Dates ─────────── */

type DateInput = Date | string | number;

function toDate(d: DateInput): Date {
  return d instanceof Date ? d : new Date(d);
}

export function formatDate(
  d: DateInput,
  opts: Intl.DateTimeFormatOptions & { locale?: string; timezone?: string } = {},
): string {
  const { locale, timezone, ...rest } = opts;
  return new Intl.DateTimeFormat(locale ?? currentLocale(), {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    ...(timezone ? { timeZone: timezone } : {}),
    ...rest,
  }).format(toDate(d));
}

export function formatDateTime(
  d: DateInput,
  opts: Intl.DateTimeFormatOptions & { locale?: string; timezone?: string } = {},
): string {
  return formatDate(d, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...opts,
  });
}

export function formatTime(
  d: DateInput,
  opts: Intl.DateTimeFormatOptions & { locale?: string; timezone?: string } = {},
): string {
  return formatDate(d, {
    hour: '2-digit',
    minute: '2-digit',
    year: undefined,
    month: undefined,
    day: undefined,
    ...opts,
  });
}

/* ─────────── Relative time (e.g. "2 hours ago") ─────────── */

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
  { unit: 'year',   ms: 365.25 * 24 * 3600_000 },
  { unit: 'month',  ms: 30 * 24 * 3600_000 },
  { unit: 'week',   ms: 7 * 24 * 3600_000 },
  { unit: 'day',    ms: 24 * 3600_000 },
  { unit: 'hour',   ms: 3600_000 },
  { unit: 'minute', ms: 60_000 },
  { unit: 'second', ms: 1000 },
];

export function formatRelative(
  d: DateInput,
  opts: { locale?: string; now?: Date } = {},
): string {
  const rtf = new Intl.RelativeTimeFormat(opts.locale ?? currentLocale(), { numeric: 'auto' });
  const diffMs = toDate(d).getTime() - (opts.now ?? new Date()).getTime();
  for (const { unit, ms } of RELATIVE_UNITS) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit);
    }
  }
  return rtf.format(0, 'second');
}

/* ─────────── List formatting (e.g. "A, B, and C") ─────────── */

export function formatList(items: string[], opts: { locale?: string } = {}): string {
  // Intl.ListFormat — handles the oxford-comma / language differences.
  return new Intl.ListFormat(opts.locale ?? currentLocale(), {
    style: 'long',
    type: 'conjunction',
  }).format(items);
}
