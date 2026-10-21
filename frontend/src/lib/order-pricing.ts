/**
 * A preview of the server's order pricing (`field-orders.controller.ts`
 * `priceItems`) so the order form can show live totals. The server prices
 * every order itself from the catalogue — these figures are never sent.
 *
 *   lineSubtotal = round2(round2(qty × price) × (1 − discount%/100))
 *   lineGst      = round2(lineSubtotal × gstRate/100)
 *   lineTotal    = round2(lineSubtotal + lineGst)
 *   subtotal = Σ lineSubtotal, gstTotal = Σ lineGst, total = subtotal + gstTotal
 *   discountTotal = Σ round2(qty × price) − subtotal
 */

/** Paise rounding, the same as the backend's `roundMoney`. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface PricingLine {
  unitPrice: number;
  gstRate: number;
  quantity: number;
  discountPercent: number;
}

export interface PricedLine {
  lineGross: number;
  lineSubtotal: number;
  lineGst: number;
  lineTotal: number;
}

export interface PricedOrder {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  gstTotal: number;
  total: number;
}

const finite = (n: number): number => (Number.isFinite(n) ? n : 0);

export function priceLine(line: PricingLine): PricedLine {
  const qty = finite(line.quantity);
  const discount = Math.min(100, Math.max(0, finite(line.discountPercent)));
  const lineGross = round2(qty * finite(line.unitPrice));
  const lineSubtotal = round2(lineGross * (1 - discount / 100));
  const lineGst = round2((lineSubtotal * finite(line.gstRate)) / 100);
  return { lineGross, lineSubtotal, lineGst, lineTotal: round2(lineSubtotal + lineGst) };
}

export function priceOrder(lines: PricingLine[]): PricedOrder {
  const priced = lines.map(priceLine);
  const gross = priced.reduce((s, l) => s + l.lineGross, 0);
  const subtotal = round2(priced.reduce((s, l) => s + l.lineSubtotal, 0));
  const gstTotal = round2(priced.reduce((s, l) => s + l.lineGst, 0));
  return {
    lines: priced,
    subtotal,
    discountTotal: round2(gross - subtotal),
    gstTotal,
    total: round2(subtotal + gstTotal),
  };
}
