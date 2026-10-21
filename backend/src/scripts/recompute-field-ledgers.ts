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
/* eslint-disable no-console -- CLI script: its result must print regardless of LOG_LEVEL */
import 'dotenv/config';
import type { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { Client } from '../models/client.model.js';
import { ProductOrder } from '../models/product-order.model.js';
import {
  computeClientLedger,
  computeOrderPayments,
  type ClientLedger,
  type OrderPayments,
} from '../services/field-ledger.service.js';
import { isMainModule } from '../lib/is-main-module.js';

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

const num = (value: unknown): number => Number(value) || 0;
const money = (value: unknown): string => num(value).toFixed(2);

function parseArgs(argv: readonly string[]): { apply: boolean } {
  let apply = false;
  for (const arg of argv) {
    if (arg === '--apply') apply = true;
    else if (arg === '--dry-run') apply = false;
    else throw new Error(`Unknown argument "${arg}". Usage: recompute-field-ledgers [--apply]`);
  }
  return { apply };
}

/**
 * Compare every order and client with its recomputed figures and — with
 * `--apply` — store the new ones. Prints one line per change through
 * `print`. Expects an open mongoose connection.
 */
export async function runRecomputeFieldLedgers(
  argv: readonly string[],
  print: (line: string) => void = console.log,
): Promise<RecomputeResult> {
  const { apply } = parseArgs(argv);
  print(
    apply
      ? 'Field ledger recompute — applying changes'
      : 'Field ledger recompute — dry run (nothing is written; re-run with --apply to write)',
  );

  // Orders first: their payment state is what the order screens show.
  const orders: OrderChange[] = [];
  let ordersChecked = 0;
  const orderCursor = ProductOrder.find({})
    .setOptions({ withDeleted: true })
    .select('orderNumber paidAmount paymentStatus')
    .sort({ _id: 1 })
    .lean()
    .cursor();
  for await (const order of orderCursor) {
    ordersChecked += 1;
    const before: OrderPayments = {
      paidAmount: num(order.paidAmount),
      paymentStatus: (order.paymentStatus ?? 'pending') as OrderPayments['paymentStatus'],
    };
    const after = await computeOrderPayments(order._id);
    if (before.paidAmount === after.paidAmount && before.paymentStatus === after.paymentStatus) continue;
    const change: OrderChange = { id: String(order._id), orderNumber: order.orderNumber, before, after };
    orders.push(change);
    print(
      `  order ${change.orderNumber ?? '(no number)'} [${change.id}]: paid ${money(before.paidAmount)} ${before.paymentStatus}` +
        ` → ${money(after.paidAmount)} ${after.paymentStatus}`,
    );
    if (apply) {
      await ProductOrder.updateOne({ _id: order._id as Types.ObjectId }, { $set: after })
        .setOptions({ withDeleted: true })
        .exec();
    }
  }

  const clients: ClientChange[] = [];
  let clientsChecked = 0;
  const clientCursor = Client.find({})
    .setOptions({ withDeleted: true })
    .select('name totalOrders totalOrderValue totalPayments outstandingAmount')
    .sort({ _id: 1 })
    .lean()
    .cursor();
  for await (const client of clientCursor) {
    clientsChecked += 1;
    const before: ClientLedger = {
      totalOrders: num(client.totalOrders),
      totalOrderValue: num(client.totalOrderValue),
      totalPayments: num(client.totalPayments),
      outstandingAmount: num(client.outstandingAmount),
    };
    const after = await computeClientLedger(client._id);
    const same = (Object.keys(after) as Array<keyof ClientLedger>).every((k) => before[k] === after[k]);
    if (same) continue;
    const change: ClientChange = { id: String(client._id), name: client.name, before, after };
    clients.push(change);
    print(
      `  client ${change.name ?? '(no name)'} [${change.id}]: outstanding ${money(before.outstandingAmount)} → ${money(after.outstandingAmount)}` +
        ` (orders ${before.totalOrders}/${money(before.totalOrderValue)} → ${after.totalOrders}/${money(after.totalOrderValue)},` +
        ` payments ${money(before.totalPayments)} → ${money(after.totalPayments)})`,
    );
    if (apply) {
      await Client.updateOne({ _id: client._id as Types.ObjectId }, { $set: after })
        .setOptions({ withDeleted: true })
        .exec();
    }
  }

  const changed = orders.length + clients.length;
  print(
    `Orders checked: ${ordersChecked}, changed: ${orders.length}. Clients checked: ${clientsChecked}, changed: ${clients.length}` +
      (apply ? ' — applied.' : changed > 0 ? ' — dry run, nothing written.' : '.'),
  );
  return { applied: apply, ordersChecked, clientsChecked, orders, clients };
}

async function main(): Promise<void> {
  await connectDatabase();
  try {
    await runRecomputeFieldLedgers(process.argv.slice(2));
  } finally {
    await disconnectDatabase();
  }
}

// Run only when executed (tsx / node), never when imported (tests).
if (isMainModule(import.meta.url)) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('recompute-field-ledgers failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
