import { useMemo } from 'react';
import {
  formatCurrency as rawCurrency,
  formatDate as rawDate,
  formatDateTime as rawDateTime,
  formatRelative as rawRelative,
  formatNumber as rawNumber,
} from '../lib/format';

export function useLocale(): {
  currency: (amount: number, opts?: { compact?: boolean }) => string;
  date: (d: Date | string | number) => string;
  dateTime: (d: Date | string | number) => string;
  relative: (d: Date | string | number) => string;
  number: (n: number, opts?: Intl.NumberFormatOptions) => string;
  currencyCode: string;
  timezone: string;
} {
  const currencyCode = 'INR';
  const timezone = 'Asia/Kolkata';

  return useMemo(
    () => ({
      currency: (amount, opts) =>
        rawCurrency(amount, { currency: currencyCode, compact: opts?.compact }),
      date: (d) => rawDate(d, { timezone }),
      dateTime: (d) => rawDateTime(d, { timezone }),
      relative: (d) => rawRelative(d),
      number: (n, opts) => rawNumber(n, opts),
      currencyCode,
      timezone,
    }),
    [],
  );
}
