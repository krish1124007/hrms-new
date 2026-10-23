/**
 * Field sales is deleted (Field Visits replaces it): no source file — route,
 * model, controller, service or test — may bring back its models, its
 * permission names, its collections, or a field route for products, orders,
 * payments, targets or the leaderboard. Migrations (outside src/) keep their
 * history and are not scanned.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = fileURLToPath(import.meta.url);

function tsFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(full);
    return entry.name.endsWith('.ts') && full !== SELF ? [full] : [];
  });
}

const rel = (file: string): string => path.relative(SRC, file);

/**
 * The files whose job is retiring the old names: the seed's permission
 * rename map (and its test) and the test of the migration that drops the
 * sales collections. Nothing else may mention them.
 */
const RETIREMENT_FILES = new Set(['lib/seed-roles.ts', 'scripts/seed.test.ts', 'test/field-visits-migration.test.ts']);

/** Identifiers and names that only the deleted sales code used. */
const FORBIDDEN = [
  /\b(ProductOrder|PaymentCollection|SalesTarget|Product)\b/,
  /\b(productorders|paymentcollections|salestargets)\b/,
  /product-order|payment-collection|sales-target|product\.model|counter\.model|lib\/sequence/,
  /field-ledger|field-receipt|recompute-field-ledgers|field-(orders|payments|products|targets|dashboard|clients)\.controller/,
  /field-sales/,
  /\bclient\.model\b/,
];

/** Field Visits files: no sales vocabulary at all. */
const FIELD_FILE = /(^|\/)(field[-.][^/]*|visit\.model)\.ts$/;
const SALES_WORDS = /\b(products?|orders?|payments?|targets?|leaderboard|receipts?|sales|ledgers?|outstanding)\b/i;

describe('field sales is gone', () => {
  const files = tsFiles(SRC);

  it('scans the source tree', () => {
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => rel(f) === 'routes/field.routes.ts')).toBe(true);
  });

  it('no file names a sales model, collection, permission or module', () => {
    const hits: string[] = [];
    for (const file of files.filter((f) => !RETIREMENT_FILES.has(rel(f)))) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        for (const pattern of FORBIDDEN) if (pattern.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('no Field Visits file (routes, models, controllers, services, tests) uses sales words', () => {
    const fieldFiles = files.filter((f) => FIELD_FILE.test(rel(f)) && !RETIREMENT_FILES.has(rel(f)));
    expect(fieldFiles.length).toBeGreaterThan(10);
    const hits: string[] = [];
    for (const file of fieldFiles) {
      const lines = fs.readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (SALES_WORDS.test(line)) hits.push(`${rel(file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });

  it('no sales model file remains, and the field router mounts no sales path', () => {
    const models = fs.readdirSync(path.join(SRC, 'models'));
    expect(models.filter((f) => /product|payment|sales|target|counter|^client\./.test(f))).toEqual([]);
    const routes = fs.readFileSync(path.join(SRC, 'routes/field.routes.ts'), 'utf8');
    const paths = [...routes.matchAll(/router\.(?:get|post|put|patch|delete)\(\s*'([^']+)'/g)].map((m) => m[1]!);
    expect(paths.length).toBeGreaterThan(20);
    expect(paths.filter((p) => /\/(products|orders|payments|targets|leaderboard|dashboard|clients)\b/.test(p))).toEqual([]);
  });
});
