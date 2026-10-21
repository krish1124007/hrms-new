/**
 * Recompute every field order's payment state and every client's ledger from
 * the source rows — the deploy-time backfill for the recomputed ledger.
 *
 *   npm run field:recompute-ledgers                    dry run: prints what would change
 *   npm run field:recompute-ledgers -- --apply         writes the changes
 *   node dist/scripts/recompute-field-ledgers.js [--apply]   (from a built deploy)
 *
 * Client figures (`totalOrders`, `totalOrderValue`, `totalPayments`,
 * `outstandingAmount`) used to be `$inc`-ed on create and never reversed, so
 * existing balances are wrong until something touches the client again. This
 * runs `computeOrderPayments` over every order and `computeClientLedger` over
 * every client (soft-deleted ones included) — the same code every field
 * mutation runs — and prints each balance that changes. Run it AFTER
 * `npm run migrate:up` (migration 20261021000002 turns legacy `draft` orders
 * into `confirmed`, so they keep counting). Re-running is harmless: an
 * up-to-date record is not listed.
 *
 * Reads MONGODB_URI (backend/.env or the shell) like the other scripts.
 */
import 'dotenv/config';
import { type ClientLedger, type OrderPayments } from '../services/field-ledger.service.js';
export interface OrderChange {
    id: string;
    orderNumber?: string;
    before: OrderPayments;
    after: OrderPayments;
}
export interface ClientChange {
    id: string;
    name?: string;
    before: ClientLedger;
    after: ClientLedger;
}
export interface RecomputeResult {
    applied: boolean;
    ordersChecked: number;
    clientsChecked: number;
    orders: OrderChange[];
    clients: ClientChange[];
}
/**
 * Compare every order and client with its recomputed figures and — with
 * `--apply` — store the new ones. Prints one line per change through
 * `print`. Expects an open mongoose connection.
 */
export declare function runRecomputeFieldLedgers(argv: readonly string[], print?: (line: string) => void): Promise<RecomputeResult>;
//# sourceMappingURL=recompute-field-ledgers.d.ts.map