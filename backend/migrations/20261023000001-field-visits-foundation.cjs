/**
 * Field Visits foundation: field sales is deleted, clients become sites.
 *
 *  1. Stops BEFORE changing anything when a sales collection still holds a
 *     document (products, productorders, paymentcollections, salestargets —
 *     soft-deleted rows included), listing each with its count. Sales data
 *     is never dropped silently: export or delete it by hand, then re-run.
 *  2. Copies every client into `fieldsites`, keeping its `_id` (so visits and
 *     tasks keep pointing at the same place): name; type "Client office";
 *     address (line1 + line2, city, state, pincode); the pin when it is a valid
 *     GeoJSON point; radius 200 m; contact person/phone; notes (company,
 *     e-mail and the note texts, one per line); assigned rep → `assignedTo`;
 *     `lastVisitAt` / `visitCount` from the client and its visits; the
 *     soft-delete fields and timestamps. A site that already exists is left
 *     as it is. `clients` itself is kept (unused) for down().
 *  3. Visits and field tasks: `clientId` is renamed `siteId`; the visits'
 *     `orderPlaced` / `paymentCollected` links are removed.
 *  4. Permissions: `field-sales.view` → `field.view` and `field-sales.manage`
 *     → `field.manage` in every role's `permissions` and every user's
 *     `customPermissions` (soft-deleted users too) — renamed, never stripped.
 *  5. Drops products, productorders, paymentcollections, salestargets (empty
 *     by step 1) and `counters` (only the order/receipt numbering used it).
 *  6. Indexes: fieldsites `location_2dsphere`, `assignedTo_1`, `name_1`,
 *     `clientRef_1` (unique, sparse); fieldsettings `singleton_1` (unique).
 *
 * Idempotent: re-running after a failure (or twice) is safe.
 *
 * down(): renames `siteId` back to `clientId`, maps the permissions back,
 * and deletes the sites that were copied from clients (sites pinned since
 * stay in `fieldsites`; visits made at them will point at no client). The
 * dropped sales collections cannot be restored (they were empty), nor the
 * removed order/payment links. Indexes are left in place.
 *
 * Run with:  npx migrate-mongo up -f migrate-mongo-config.cjs
 */

const SALES_COLLECTIONS = ['products', 'productorders', 'paymentcollections', 'salestargets'];
const DROPPED_COLLECTIONS = [...SALES_COLLECTIONS, 'counters'];
const PERMISSION_RENAMES = [
  ['field-sales.view', 'field.view'],
  ['field-sales.manage', 'field.manage'],
];
const DEFAULT_SITE_TYPE = 'Client office';
const DEFAULT_RADIUS_M = 200;

async function exists(db, name) {
  return (await db.listCollections({ name }, { nameOnly: true }).toArray()).length > 0;
}

async function indexesOf(col) {
  try {
    return await col.indexes();
  } catch (err) {
    if (err && err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Build `key` as `options.name` unless an equivalent index exists; rebuild a same-named different one. */
async function ensureIndex(db, collection, key, options) {
  const col = db.collection(collection);
  const existing = await indexesOf(col);
  const same = (ix) =>
    sameJson(ix.key, key) && Boolean(ix.unique) === Boolean(options.unique) && Boolean(ix.sparse) === Boolean(options.sparse);
  if (existing.some(same)) return;
  if (existing.some((ix) => ix.name === options.name)) await col.dropIndex(options.name);
  try {
    await col.createIndex(key, options);
  } catch (err) {
    // The same key under another name with other options — replace it with ours.
    if (!err || (err.code !== 85 && err.code !== 86)) throw err;
    const clash = (await indexesOf(col)).find((ix) => sameJson(ix.key, key) && ix.name !== '_id_');
    if (!clash) throw err;
    await col.dropIndex(clash.name);
    await col.createIndex(key, options);
  }
}

const text = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);

/** `[lng, lat]` of a valid, non-placeholder GeoJSON point, else null. */
function pointOf(location) {
  if (!location || location.type !== 'Point' || !Array.isArray(location.coordinates)) return null;
  const coords = location.coordinates.map(Number);
  if (coords.length !== 2 || !coords.every(Number.isFinite)) return null;
  const [lng, lat] = coords;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  return [lng, lat];
}

const later = (a, b) => {
  if (!a) return b || undefined;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
};

/** The site a client becomes (see the header). */
function siteFromClient(c, stats) {
  const address = c.address || {};
  const line1 = [text(address.line1), text(address.line2)].filter(Boolean).join(', ');
  const notes = [
    text(c.company) && `Company: ${text(c.company)}`,
    text(c.email) && `Email: ${text(c.email)}`,
    ...(Array.isArray(c.notes) ? c.notes.map((n) => n && text(n.text)) : []),
  ].filter(Boolean);
  const coords = pointOf(c.location);
  const site = {
    name: text(c.name) || 'Unnamed site',
    type: DEFAULT_SITE_TYPE,
    address: Object.fromEntries(
      Object.entries({ line1, city: text(address.city), state: text(address.state), pincode: text(address.pincode) }).filter(
        ([, v]) => v,
      ),
    ),
    radiusM: DEFAULT_RADIUS_M,
    assignedTo: c.assignedTo ? [c.assignedTo] : [],
    createdVia: 'web',
    visitCount: stats ? stats.count : 0,
    isDeleted: c.isDeleted === true,
    deletedAt: c.deletedAt || null,
    deletedBy: c.deletedBy || null,
    deleteReason: c.deleteReason || null,
    schemaVersion: 1,
    createdAt: c.createdAt || new Date(),
    updatedAt: c.updatedAt || new Date(),
  };
  if (coords) site.location = { type: 'Point', coordinates: coords };
  if (text(c.contactPerson)) site.contactName = text(c.contactPerson);
  if (text(c.phone)) site.contactPhone = text(c.phone);
  if (notes.length > 0) site.notes = notes.join('\n');
  const lastVisitAt = later(c.lastVisitDate, stats && stats.last);
  if (lastVisitAt) site.lastVisitAt = new Date(lastVisitAt);
  return site;
}

async function copyClientsToSites(db) {
  if (!(await exists(db, 'clients'))) return 0;
  const stats = new Map();
  const rows = await db
    .collection('visits')
    .aggregate([
      { $match: { clientId: { $exists: true }, isDeleted: { $ne: true } } },
      { $group: { _id: '$clientId', count: { $sum: 1 }, last: { $max: '$checkIn.time' } } },
    ])
    .toArray();
  for (const r of rows) stats.set(String(r._id), r);

  const clients = await db.collection('clients').find({}).toArray();
  if (clients.length === 0) return 0;
  const result = await db.collection('fieldsites').bulkWrite(
    clients.map((c) => ({
      updateOne: {
        filter: { _id: c._id },
        update: { $setOnInsert: siteFromClient(c, stats.get(String(c._id))) },
        upsert: true,
      },
    })),
    { ordered: false },
  );
  return result.upsertedCount;
}

async function renameField(db, collection, from, to) {
  return db.collection(collection).updateMany({ [from]: { $exists: true } }, { $rename: { [from]: to } });
}

async function renamePermission(db, from, to) {
  for (const [collection, field] of [
    ['roles', 'permissions'],
    ['users', 'customPermissions'],
  ]) {
    const col = db.collection(collection);
    // eslint-disable-next-line no-await-in-loop
    await col.updateMany({ [field]: from }, { $addToSet: { [field]: to } });
    // eslint-disable-next-line no-await-in-loop
    await col.updateMany({ [field]: from }, { $pull: { [field]: from } });
  }
}

module.exports = {
  async up(db) {
    // 1. Fail early, before any change, while sales data exists.
    const problems = [];
    for (const name of SALES_COLLECTIONS) {
      // eslint-disable-next-line no-await-in-loop
      const n = (await exists(db, name)) ? await db.collection(name).countDocuments({}) : 0;
      if (n > 0) problems.push(`${name}: ${n} document(s)`);
    }
    if (problems.length > 0) {
      throw new Error(
        `Field sales data still exists — export or delete it first (nothing was changed):\n  ${problems.join('\n  ')}`,
      );
    }

    // 2. Clients → sites.
    const copied = await copyClientsToSites(db);

    // 3. clientId → siteId; the order/payment links go.
    await renameField(db, 'visits', 'clientId', 'siteId');
    await renameField(db, 'fieldtasks', 'clientId', 'siteId');
    await db
      .collection('visits')
      .updateMany(
        { $or: [{ orderPlaced: { $exists: true } }, { paymentCollected: { $exists: true } }] },
        { $unset: { orderPlaced: '', paymentCollected: '' } },
      );

    // 4. Permission names.
    for (const [from, to] of PERMISSION_RENAMES) {
      // eslint-disable-next-line no-await-in-loop
      await renamePermission(db, from, to);
    }

    // 5. The sales collections (and the numbering counters).
    const dropped = [];
    for (const name of DROPPED_COLLECTIONS) {
      // eslint-disable-next-line no-await-in-loop
      if (await exists(db, name)) {
        // eslint-disable-next-line no-await-in-loop
        await db.collection(name).drop();
        dropped.push(name);
      }
    }

    // 6. Indexes.
    await ensureIndex(db, 'fieldsites', { location: '2dsphere' }, { name: 'location_2dsphere' });
    await ensureIndex(db, 'fieldsites', { assignedTo: 1 }, { name: 'assignedTo_1' });
    await ensureIndex(db, 'fieldsites', { name: 1 }, { name: 'name_1' });
    await ensureIndex(db, 'fieldsites', { clientRef: 1 }, { name: 'clientRef_1', unique: true, sparse: true });
    await ensureIndex(db, 'fieldsettings', { singleton: 1 }, { name: 'singleton_1', unique: true });

    // eslint-disable-next-line no-console
    console.log(
      `field visits: ${copied} client(s) copied to sites; dropped ${dropped.length ? dropped.join(', ') : 'nothing'}`,
    );
  },

  async down(db) {
    // Sites copied from clients go (the clients are still there); pinned ones stay.
    if (await exists(db, 'clients')) {
      const ids = (await db.collection('clients').find({}).project({ _id: 1 }).toArray()).map((c) => c._id);
      if (ids.length > 0) await db.collection('fieldsites').deleteMany({ _id: { $in: ids } });
    }
    await renameField(db, 'visits', 'siteId', 'clientId');
    await renameField(db, 'fieldtasks', 'siteId', 'clientId');
    for (const [from, to] of PERMISSION_RENAMES) {
      // eslint-disable-next-line no-await-in-loop
      await renamePermission(db, to, from);
    }
  },
};
