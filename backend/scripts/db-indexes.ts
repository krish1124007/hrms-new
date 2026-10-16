#!/usr/bin/env tsx
/**
 * Database index audit.
 *
 * Scans the live Mongo database and reports, per collection:
 *   - Collections missing a `tenantId` index (cross-tenant table scans!)
 *   - Indexes that duplicate each other (wasted RAM)
 *   - Single-field indexes that could be merged into a compound one
 *   - Large unused indexes (via $indexStats)
 *
 * Run against staging/prod (read-only):
 *   MONGODB_URI="mongodb+srv://..." tsx scripts/db-indexes.ts
 *
 * Does NOT modify anything — safe to run on prod.
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('MONGODB_URI env var required');
  process.exit(2);
}

interface Issue {
  collection: string;
  severity: 'error' | 'warn' | 'info';
  message: string;
}

async function main(): Promise<void> {
  await mongoose.connect(uri!);
  const db = mongoose.connection.db!;
  const collections = await db.listCollections().toArray();
  const issues: Issue[] = [];

  for (const c of collections) {
    if (c.name.startsWith('system.') || c.type === 'view') continue;
    const indexes = await db.collection(c.name).indexes();
    const indexNames = indexes.map((i) => i.name ?? JSON.stringify(i.key));

    // 1. Tenant-scoped collections must have a tenantId index (either alone
    //    or as the first field of a compound index). Missing → every query
    //    with an unresolved tenantId falls back to a collection scan.
    const sample = await db.collection(c.name).findOne({});
    const hasTenantId = sample && 'tenantId' in sample;
    if (hasTenantId) {
      const tenantIndexed = indexes.some((i) => {
        const firstField = Object.keys(i.key)[0];
        return firstField === 'tenantId';
      });
      if (!tenantIndexed) {
        issues.push({
          collection: c.name,
          severity: 'error',
          message: `has tenantId field but no index starts with tenantId — every query does a collection scan`,
        });
      }
    }

    // 2. Duplicate indexes — same key spec under different names
    const keyFingerprints = new Map<string, string[]>();
    for (const idx of indexes) {
      if (idx.name === '_id_') continue;
      const fp = JSON.stringify(idx.key);
      const list = keyFingerprints.get(fp) ?? [];
      list.push(idx.name ?? '<anon>');
      keyFingerprints.set(fp, list);
    }
    for (const [fp, names] of keyFingerprints) {
      if (names.length > 1) {
        issues.push({
          collection: c.name,
          severity: 'warn',
          message: `duplicate indexes on ${fp}: ${names.join(', ')}`,
        });
      }
    }

    // 3. Single-field indexes on a field that also appears as the first
    //    column of a compound index are redundant (compound can serve both).
    const compoundPrefixes = new Set<string>();
    for (const idx of indexes) {
      const keys = Object.keys(idx.key);
      if (keys.length > 1) compoundPrefixes.add(keys[0]);
    }
    for (const idx of indexes) {
      const keys = Object.keys(idx.key);
      if (keys.length === 1 && compoundPrefixes.has(keys[0]) && idx.name !== '_id_') {
        issues.push({
          collection: c.name,
          severity: 'info',
          message: `single-field index on ${keys[0]} is redundant with an existing compound index`,
        });
      }
    }

    // 4. Unused indexes — via $indexStats. Only flags indexes with ZERO
    //    `accesses.ops` since server restart (not perfect but useful).
    try {
      const stats = await db
        .collection(c.name)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .aggregate([{ $indexStats: {} as any }])
        .toArray();
      for (const s of stats) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ops = ((s as any).accesses?.ops ?? 0) as number;
        if (ops === 0 && s.name !== '_id_') {
          issues.push({
            collection: c.name,
            severity: 'info',
            message: `index ${String(s.name)} has zero hits since server start — may be unused`,
          });
        }
      }
    } catch {
      // $indexStats requires permissions we may not have on a scratch DB
    }

    void indexNames;
  }

  await mongoose.disconnect();

  // Print
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  const infos = issues.filter((i) => i.severity === 'info');

  for (const i of [...errors, ...warns, ...infos]) {
    const emoji = i.severity === 'error' ? '❌' : i.severity === 'warn' ? '⚠️ ' : 'ℹ️ ';
    console.log(`${emoji} [${i.collection}] ${i.message}`);
  }

  console.log(
    `\n${collections.length} collections scanned — ${errors.length} errors, ${warns.length} warnings, ${infos.length} info.`,
  );

  if (errors.length > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
