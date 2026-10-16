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
export declare const SAAS_HSN_CODE = "998314";
export interface TaxBreakdown {
    gross: number;
    net: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    rate: number;
    placeOfSupply: string;
    interState: boolean;
    hsnCode: string;
}
export declare function computeTax(grossAmount: number, buyerState?: string): TaxBreakdown;
//# sourceMappingURL=tax.service.d.ts.map