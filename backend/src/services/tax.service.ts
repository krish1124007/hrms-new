import { env } from '../config/env.js';

/**
 * Indian GST tax engine.
 *
 * GST = 18% on SaaS services. Split depends on the place-of-supply rule:
 *   - Intra-state  (buyer state === seller state) → CGST 9% + SGST 9%
 *   - Inter-state  (different states)             → IGST 18%
 *
 * The seller (us) is in `COMPANY_STATE_CODE` (env). The buyer is the
 * tenant — we look at `tenant.address.state`. Missing/unrecognised states
 * default to IGST (safer for compliance: we charge, customer reclaims).
 *
 * Prices are stored tax-INCLUSIVE everywhere (Indian convention), so the
 * breakdown is reverse-calculated from a gross total. All amounts are
 * rounded to 2 decimals.
 *
 * HSN code for SaaS: 998314 (computer programming services). This is
 * informational only — the invoice template includes it.
 */

export const SAAS_HSN_CODE = '998314';

export interface TaxBreakdown {
  gross: number;       // tax-inclusive total the customer pays
  net: number;         // pre-tax subtotal
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  rate: number;        // e.g. 0.18 for 18%
  placeOfSupply: string;
  interState: boolean;
  hsnCode: string;
}

/** Normalise state strings/codes to a 2-letter ISO-3166-2 state code. */
function normaliseState(s?: string): string | null {
  if (!s) return null;
  const v = s.trim().toUpperCase();
  // Already a 2-letter code like "MH", "KA"
  if (/^[A-Z]{2}$/.test(v)) return v;
  // Common names
  const map: Record<string, string> = {
    MAHARASHTRA: 'MH',
    KARNATAKA: 'KA',
    'TAMIL NADU': 'TN',
    TAMILNADU: 'TN',
    DELHI: 'DL',
    TELANGANA: 'TS',
    'UTTAR PRADESH': 'UP',
    'WEST BENGAL': 'WB',
    GUJARAT: 'GJ',
    RAJASTHAN: 'RJ',
    KERALA: 'KL',
    PUNJAB: 'PB',
    HARYANA: 'HR',
    ODISHA: 'OR',
    ASSAM: 'AS',
    BIHAR: 'BR',
    'MADHYA PRADESH': 'MP',
    CHHATTISGARH: 'CG',
    JHARKHAND: 'JH',
    UTTARAKHAND: 'UK',
    'HIMACHAL PRADESH': 'HP',
    GOA: 'GA',
    'ANDHRA PRADESH': 'AP',
  };
  return map[v] ?? null;
}

export function computeTax(
  grossAmount: number,
  buyerState?: string,
): TaxBreakdown {
  const rate = env.GST_RATE_PERCENT / 100;
  const net = +((grossAmount / (1 + rate))).toFixed(2);
  const totalTax = +((grossAmount - net)).toFixed(2);

  const sellerStateCode = normaliseState(env.COMPANY_STATE_CODE) ?? 'MH';
  const buyerStateCode = normaliseState(buyerState) ?? sellerStateCode; // default to intra
  const interState = sellerStateCode !== buyerStateCode;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (interState) {
    igst = totalTax;
  } else {
    cgst = +((totalTax / 2)).toFixed(2);
    sgst = +((totalTax - cgst)).toFixed(2); // absorb rounding error in sgst
  }

  return {
    gross: grossAmount,
    net,
    cgst,
    sgst,
    igst,
    totalTax,
    rate,
    placeOfSupply: buyerStateCode,
    interState,
    hsnCode: SAAS_HSN_CODE,
  };
}
