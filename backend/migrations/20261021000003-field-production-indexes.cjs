/**
 * Production indexes for the field module and push devices, plus the
 * one-offs they need first. `autoIndex` is off in production, so an index a
 * model declares does not exist there until a migration builds it.
 *
 *  1. Checks the unique indexes can be built — no duplicate order numbers,
 *     receipt numbers, live product SKUs or monthly targets. Any duplicate
 *     stops the migration BEFORE anything is changed, listing the clashing
 *     documents (money records are never merged or renamed automatically).
 *  2. Push devices: duplicate tokens are collapsed to the newest row.
 *  3. Visits: every `in_progress` visit whose check-in IST day is over is
 *     closed — `status: 'completed'`, `checkOut.time` = the start of the next
 *     IST day, `metadata.autoClosed: true`. An employee still left with two
 *     open visits today keeps the newest; each older one is closed at the
 *     check-in of the visit after it (also `metadata.autoClosed`). Without
 *     this the one-open-visit index cannot be built.
 *  4. Builds (or confirms) the indexes:
 *       locationtracks  { employeeId: 1, timestamp: -1 }
 *       visits          one_open_visit_per_employee (unique, partial
 *                       { status: 'in_progress', isDeleted: false }),
 *                       { 'checkIn.time': -1 }
 *       products        sku_unique_live (unique, partial { isDeleted: false }),
 *                       { category: 1, isActive: 1 }, { name: 1 }
 *       productorders   orderNumber_1 (unique)
 *       paymentcollections receiptNumber_1 (unique), { orderId: 1 }
 *       clients         location_2dsphere
 *       salestargets    { employeeId, period.year, period.month, type } (unique)
 *       pushdevices     token_1 (unique), userId_1
 *     An existing index with the same name but another definition is
 *     rebuilt; one with the same definition under another name is kept.
 *
 * Idempotent: re-running after a failure (or twice) is safe.
 *
 * down(): drops the indexes this branch introduced (one_open_visit_per_employee,
 * checkIn.time_-1, the three product indexes, paymentcollections orderId_1)
 * and reopens the visits this migration closed. The indexes the models had
 * declared before (order/receipt numbers, targets, client location, location
 * tracks, push devices) are left in place — they may well have existed
 * already. Collapsed duplicate push tokens are not restored (they were
 * copies of a row that is kept).
 *
 * Run with:  npx migrate-mongo up      (then the ledger backfill:
 *            node dist/scripts/recompute-field-ledgers.js [--apply])
 */

const TZ = process.env.TIMEZONE || 'Asia/Kolkata';
const DAY_MS = 24 * 60 * 60 * 1000;

/** How far TZ is ahead of UTC at `at`, in ms. */
function offsetMs(at) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return wall - Math.floor(at.getTime() / 60000) * 60000;
}

/** The instant the TZ calendar day containing `at` starts. */
function startOfDay(at) {
  const local = new Date(at.getTime() + offsetMs(at));
  const midnightWall = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(midnightWall - offsetMs(new Date(midnightWall)));
}

async function indexesOf(col) {
  try {
    return await col.indexes();
  } catch (err) {
    // A collection that was never written has no indexes yet.
    if (err && err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Does the existing index `ix` mean the same as `key` + `options`? */
function sameDefinition(ix, key, options) {
  return (
    sameJson(ix.key, key) &&
    Boolean(ix.unique) === Boolean(options.unique) &&
    sameJson(ix.partialFilterExpression, options.partialFilterExpression)
  );
}

/** Build `key` as `options.name` unless an equivalent index exists; rebuild a same-named different one. */
async function ensureIndex(db, collection, key, options) {
  const col = db.collection(collection);
  const existing = await indexesOf(col);
  if (existing.some((ix) => sameDefinition(ix, key, options))) return;
  const named = existing.find((ix) => ix.name === options.name);
  if (named) await col.dropIndex(options.name);
  try {
    await col.createIndex(key, options);
  } catch (err) {
    // IndexOptionsConflict / IndexKeySpecsConflict: the same key under
    // another name with other options — replace it with ours.
    if (!err || (err.code !== 85 && err.code !== 86)) throw err;
    const clash = (await indexesOf(col)).find((ix) => sameJson(ix.key, key) && ix.name !== '_id_');
    if (!clash) throw err;
    await col.dropIndex(clash.name);
    await col.createIndex(key, options);
  }
}

async function dropIndexIfExists(db, collection, name) {
  const col = db.collection(collection);
  if ((await indexesOf(col)).some((ix) => ix.name === name)) await col.dropIndex(name);
}

/** Groups of documents that would collide in a unique index on `group` (among `match`). */
async function duplicateGroups(db, collection, group, match = {}) {
  return db
    .collection(collection)
    .aggregate([
      { $match: match },
      { $group: { _id: group, n: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { n: { $gt: 1 } } },
      { $limit: 20 },
    ])
    .toArray();
}

const UNIQUE_CHECKS = [
  { collection: 'productorders', label: 'order number', group: '$orderNumber' },
  { collection: 'paymentcollections', label: 'receipt number', group: '$receiptNumber' },
  { collection: 'products', label: 'live product SKU', group: '$sku', match: { isDeleted: false } },
  {
    collection: 'salestargets',
    label: 'target (employee, month, type)',
    group: { employeeId: '$employeeId', year: '$period.year', month: '$period.month', type: '$type' },
  },
];

/** Keep the newest row per push token. */
async function collapseDuplicatePushTokens(db) {
  const col = db.collection('pushdevices');
  const groups = await col
    .aggregate([
      { $sort: { updatedAt: -1, _id: -1 } },
      { $group: { _id: '$token', ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
  const extra = groups.flatMap((g) => g.ids.slice(1));
  if (extra.length > 0) await col.deleteMany({ _id: { $in: extra } });
  return extra.length;
}

/** Close stale and duplicate open visits (see the header). Returns how many were closed. */
async function closeOpenVisits(db, now) {
  const col = db.collection('visits');
  const today = startOfDay(now);
  const open = await col
    .find({ status: 'in_progress' })
    .project({ employeeId: 1, 'checkIn.time': 1, createdAt: 1, isDeleted: 1 })
    .toArray();
  const startedAt = (v) => (v.checkIn && v.checkIn.time) || v.createdAt || now;

  const closes = []; // { _id, at }
  const stillOpen = new Map(); // employeeId → visits checked in today, oldest first
  for (const v of open) {
    const started = new Date(startedAt(v));
    if (started.getTime() < today.getTime()) {
      closes.push({ _id: v._id, at: new Date(startOfDay(started).getTime() + DAY_MS) });
    } else if (v.isDeleted === false) {
      const key = String(v.employeeId);
      if (!stillOpen.has(key)) stillOpen.set(key, []);
      stillOpen.get(key).push(v);
    }
  }
  for (const visits of stillOpen.values()) {
    visits.sort((a, b) => new Date(startedAt(a)) - new Date(startedAt(b)));
    for (let i = 0; i < visits.length - 1; i += 1) {
      closes.push({ _id: visits[i]._id, at: new Date(startedAt(visits[i + 1])) });
    }
  }
  if (closes.length === 0) return 0;
  await col.bulkWrite(
    closes.map((c) => ({
      updateOne: {
        filter: { _id: c._id, status: 'in_progress' },
        update: { $set: { status: 'completed', 'checkOut.time': c.at, 'metadata.autoClosed': true } },
      },
    })),
  );
  return closes.length;
}

module.exports = {
  async up(db) {
    // 1. Fail early, before any change, if a unique index cannot be built.
    const problems = [];
    for (const check of UNIQUE_CHECKS) {
      // eslint-disable-next-line no-await-in-loop
      const groups = await duplicateGroups(db, check.collection, check.group, check.match);
      for (const g of groups) {
        problems.push(`${check.collection}: duplicate ${check.label} ${JSON.stringify(g._id)} on ${g.ids.join(', ')}`);
      }
    }
    if (problems.length > 0) {
      throw new Error(
        `Cannot build the unique indexes — resolve these duplicates first (nothing was changed):\n  ${problems.join('\n  ')}`,
      );
    }

    // 2–3. The one-offs the unique indexes need.
    const collapsed = await collapseDuplicatePushTokens(db);
    const closed = await closeOpenVisits(db, new Date());
    // eslint-disable-next-line no-console
    console.log(`field indexes: ${collapsed} duplicate push token(s) removed, ${closed} open visit(s) closed`);

    // 4. Indexes.
    await ensureIndex(db, 'locationtracks', { employeeId: 1, timestamp: -1 }, { name: 'employeeId_1_timestamp_-1' });
    await ensureIndex(db, 'visits', { employeeId: 1 }, {
      name: 'one_open_visit_per_employee',
      unique: true,
      partialFilterExpression: { status: 'in_progress', isDeleted: false },
    });
    await ensureIndex(db, 'visits', { 'checkIn.time': -1 }, { name: 'checkIn.time_-1' });
    await ensureIndex(db, 'products', { sku: 1 }, {
      name: 'sku_unique_live',
      unique: true,
      partialFilterExpression: { isDeleted: false },
    });
    await ensureIndex(db, 'products', { category: 1, isActive: 1 }, { name: 'category_1_isActive_1' });
    await ensureIndex(db, 'products', { name: 1 }, { name: 'name_1' });
    await ensureIndex(db, 'productorders', { orderNumber: 1 }, { name: 'orderNumber_1', unique: true });
    await ensureIndex(db, 'paymentcollections', { receiptNumber: 1 }, { name: 'receiptNumber_1', unique: true });
    await ensureIndex(db, 'paymentcollections', { orderId: 1 }, { name: 'orderId_1' });
    await ensureIndex(db, 'clients', { location: '2dsphere' }, { name: 'location_2dsphere' });
    await ensureIndex(
      db,
      'salestargets',
      { employeeId: 1, 'period.year': 1, 'period.month': 1, type: 1 },
      { name: 'employeeId_1_period.year_1_period.month_1_type_1', unique: true },
    );
    await ensureIndex(db, 'pushdevices', { token: 1 }, { name: 'token_1', unique: true });
    await ensureIndex(db, 'pushdevices', { userId: 1 }, { name: 'userId_1' });
  },

  async down(db) {
    await dropIndexIfExists(db, 'visits', 'one_open_visit_per_employee');
    await dropIndexIfExists(db, 'visits', 'checkIn.time_-1');
    await dropIndexIfExists(db, 'products', 'sku_unique_live');
    await dropIndexIfExists(db, 'products', 'category_1_isActive_1');
    await dropIndexIfExists(db, 'products', 'name_1');
    await dropIndexIfExists(db, 'paymentcollections', 'orderId_1');
    // Reopen the visits up() closed (the one-open-visit index is gone, so
    // several open visits per employee are allowed again).
    await db.collection('visits').updateMany(
      { 'metadata.autoClosed': true },
      { $set: { status: 'in_progress' }, $unset: { 'checkOut.time': '', 'metadata.autoClosed': '' } },
    );
  },
};
