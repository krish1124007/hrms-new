/**
 * Field Visits — team, routes and travel allowance.
 *
 *  1. The built-in Field Manager role is team-scoped: it keeps `field.view`
 *     (themselves + their direct reports) and loses `field.manage` (everybody,
 *     settings), which stays with HR and admin. Only the system role
 *     (`slug: field_manager`, `isSystem: true`) is changed — custom roles and
 *     users' own permissions are left alone. Its description follows.
 *  2. Indexes (production builds them by hand — autoIndex is off):
 *     expenseclaims `travelKey_1` (unique, partial on `travelKey` existing —
 *     one live travel claim per employee per day) and fielddayroutes
 *     `employeeId_1_date_1` (unique — the measured-route cache).
 *
 * Idempotent. down(): gives the role `field.manage` and its old description
 * back, and drops the two indexes.
 *
 * Run with:  npx migrate-mongo up -f migrate-mongo-config.cjs
 */

const ROLE = { slug: 'field_manager', isSystem: true };
const DESCRIPTION =
  'Manager of a field team — plans their team’s visits, sees their visits, routes and reports, approves their claims';
const OLD_DESCRIPTION =
  'Manager of the field team — plans visits, sees every field employee’s visits, routes and reports, edits field settings';

const INDEXES = [
  {
    collection: 'expenseclaims',
    key: { travelKey: 1 },
    options: { name: 'travelKey_1', unique: true, partialFilterExpression: { travelKey: { $exists: true } } },
  },
  {
    collection: 'fielddayroutes',
    key: { employeeId: 1, date: 1 },
    options: { name: 'employeeId_1_date_1', unique: true },
  },
];

async function indexesOf(col) {
  try {
    return await col.indexes();
  } catch (err) {
    if (err && err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

const sameJson = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Build the index unless an identical one exists; replace a same-named different one. */
async function ensureIndex(db, { collection, key, options }) {
  const col = db.collection(collection);
  const existing = await indexesOf(col);
  const same = (ix) =>
    sameJson(ix.key, key) &&
    Boolean(ix.unique) === Boolean(options.unique) &&
    sameJson(ix.partialFilterExpression, options.partialFilterExpression);
  if (existing.some(same)) return;
  if (existing.some((ix) => ix.name === options.name)) await col.dropIndex(options.name);
  await col.createIndex(key, options);
}

async function dropIndex(db, { collection, options }) {
  const col = db.collection(collection);
  if ((await indexesOf(col)).some((ix) => ix.name === options.name)) await col.dropIndex(options.name);
}

module.exports = {
  async up(db) {
    await db
      .collection('roles')
      .updateMany(ROLE, { $pull: { permissions: 'field.manage' }, $set: { description: DESCRIPTION } });
    for (const index of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await ensureIndex(db, index);
    }
  },

  async down(db) {
    await db
      .collection('roles')
      .updateMany(ROLE, { $addToSet: { permissions: 'field.manage' }, $set: { description: OLD_DESCRIPTION } });
    for (const index of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await dropIndex(db, index);
    }
  },
};
