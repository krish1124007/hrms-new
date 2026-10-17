/**
 * Professional Tax — a state levy, so the slabs differ by state. Each table
 * lists the monthly deduction for a monthly gross: the first slab whose
 * `upTo` the gross does not exceed applies (bounds are inclusive, in rupees).
 *
 * Add a state by adding a table to `PT_TABLES` (and its names to
 * `STATE_NAMES`); a state with no table pays nothing.
 */

export type PtGender = 'male' | 'female' | 'other';

export interface PtSlab {
  /** Upper bound of the slab, inclusive: the slab applies while gross ≤ upTo. */
  readonly upTo: number;
  readonly amount: number;
}

export interface PtTable {
  readonly slabs: readonly PtSlab[];
  /** Replaces the slab amount in a given month (1 = January), above `exceeding`. */
  readonly monthOverride?: { readonly month: number; readonly amount: number; readonly exceeding: number };
  /** Women whose gross does not exceed this pay nothing. */
  readonly womenExemptUpTo?: number;
}

/** The amounts are rupees per month; Tamil Nadu's half-yearly slabs are shown monthly. */
export const PT_TABLES: Readonly<Record<string, PtTable>> = {
  MH: {
    slabs: [
      { upTo: 7500, amount: 0 },
      { upTo: 10000, amount: 175 },
      { upTo: Infinity, amount: 200 },
    ],
    // February carries the balance of the ₹2,500 annual cap: 300 instead of 200.
    monthOverride: { month: 2, amount: 300, exceeding: 10000 },
    womenExemptUpTo: 25000,
  },
  GJ: {
    slabs: [
      { upTo: 12000, amount: 0 },
      { upTo: Infinity, amount: 200 },
    ],
  },
  KA: {
    slabs: [
      // "Below ₹25,000 nil, ₹25,000 and above 200": 24,999.99 is the largest amount below 25,000.
      { upTo: 24999.99, amount: 0 },
      { upTo: Infinity, amount: 200 },
    ],
  },
  TN: {
    slabs: [
      { upTo: 3500, amount: 0 },
      { upTo: 5000, amount: 22.5 },
      { upTo: 7500, amount: 52.5 },
      { upTo: 10000, amount: 115 },
      { upTo: 12500, amount: 171 },
      { upTo: Infinity, amount: 208 },
    ],
  },
  WB: {
    slabs: [
      { upTo: 10000, amount: 0 },
      { upTo: 15000, amount: 110 },
      { upTo: 25000, amount: 130 },
      { upTo: 40000, amount: 150 },
      { upTo: Infinity, amount: 200 },
    ],
  },
  AP: {
    slabs: [
      { upTo: 15000, amount: 0 },
      { upTo: 20000, amount: 150 },
      { upTo: Infinity, amount: 200 },
    ],
  },
  TS: {
    slabs: [
      { upTo: 15000, amount: 0 },
      { upTo: 20000, amount: 150 },
      { upTo: Infinity, amount: 200 },
    ],
  },
};

/** Lower-case state names (and the usual spellings) → the code of its PT table. */
const STATE_NAMES: Readonly<Record<string, string>> = {
  maharashtra: 'MH',
  gujarat: 'GJ',
  karnataka: 'KA',
  'tamil nadu': 'TN',
  tamilnadu: 'TN',
  'west bengal': 'WB',
  'andhra pradesh': 'AP',
  telangana: 'TS',
};

/** Other codes in use for a state that has a table. */
const CODE_ALIASES: Readonly<Record<string, string>> = {
  TG: 'TS', // Telangana's ISO 3166-2 code
};

/**
 * The PT state code for a state given as a free-text name or as a code
 * ("Maharashtra", "tamil  nadu", "MH"), or `undefined` when it names no state
 * we hold a table for — a city ("Mumbai") is not a state.
 */
export function resolvePtStateCode(state: string | null | undefined): string | undefined {
  const text = (state ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  const upper = text.toUpperCase();
  if (Object.hasOwn(PT_TABLES, upper)) return upper;
  if (Object.hasOwn(CODE_ALIASES, upper)) return CODE_ALIASES[upper];
  const name = text.toLowerCase();
  return Object.hasOwn(STATE_NAMES, name) ? STATE_NAMES[name] : undefined;
}

export interface ProfessionalTaxInput {
  /** The state's code (`MH`, `GJ`, …); see `resolvePtStateCode`. Unknown or missing → no tax. */
  stateCode?: string | null;
  /** The gross wage for the month. */
  monthlyGross: number;
  /** Calendar month, 1 = January … 12 = December. */
  month: number;
  gender?: PtGender | null;
}

/** Professional Tax to deduct for the month; 0 for an unknown state or no wage. */
export function professionalTax({ stateCode, monthlyGross, month, gender }: ProfessionalTaxInput): number {
  const code = (stateCode ?? '').trim().toUpperCase();
  const table = Object.hasOwn(PT_TABLES, code) ? PT_TABLES[code] : undefined;
  if (!table || !(monthlyGross > 0)) return 0;

  if (gender === 'female' && table.womenExemptUpTo !== undefined && monthlyGross <= table.womenExemptUpTo) {
    return 0;
  }

  const slab = table.slabs.find((s) => monthlyGross <= s.upTo);
  if (!slab) return 0;

  const override = table.monthOverride;
  if (override && month === override.month && monthlyGross > override.exceeding) return override.amount;
  return slab.amount;
}
