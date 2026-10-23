/**
 * Field uploads get an owner, and a selfie proves one check-in only.
 *
 *  1. `fielduploads` records who uploaded each field file; records accept
 *     only their author's own upload keys. Unique index `key_1`.
 *  2. visits `selfie_single_use` { 'checkIn.photo': 1 } (unique, partial on
 *     `checkIn.photo` being a string): the visit write that stores a selfie
 *     marks it used. Stops before building anything if two visits already
 *     hold the same selfie, listing them.
 *
 * Production builds indexes by hand (autoIndex is off). Files uploaded before
 * this have no `fielduploads` record: the visits, sites and tasks that hold
 * them keep reading them, but they cannot be attached to anything new. No
 * data is changed.
 *
 * Idempotent. down(): drops both indexes (the `fielduploads` records stay;
 * the code before this change does not read them).
 *
 * Run with:  npx migrate-mongo up -f migrate-mongo-config.cjs
 */

const INDEXES = [
  { collection: 'fielduploads', key: { key: 1 }, options: { name: 'key_1', unique: true } },
  {
    collection: 'visits',
    key: { 'checkIn.photo': 1 },
    options: { name: 'selfie_single_use', unique: true, partialFilterExpression: { 'checkIn.photo': { $type: 'string' } } },
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

/** Selfies stored on more than one visit — the single-use index cannot be built over them. */
async function sharedSelfies(db) {
  return db
    .collection('visits')
    .aggregate([
      { $match: { 'checkIn.photo': { $type: 'string' } } },
      { $group: { _id: '$checkIn.photo', ids: { $push: '$_id' }, n: { $sum: 1 } } },
      { $match: { n: { $gt: 1 } } },
    ])
    .toArray();
}

module.exports = {
  async up(db) {
    const shared = await sharedSelfies(db);
    if (shared.length > 0) {
      throw new Error(
        `Visits sharing one check-in selfie — clear the photo on all but one of each (nothing was changed):\n  ${shared
          .map((s) => `${s._id}: visits ${s.ids.join(', ')}`)
          .join('\n  ')}`,
      );
    }
    for (const index of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await ensureIndex(db, index);
    }
  },

  async down(db) {
    for (const index of INDEXES) {
      // eslint-disable-next-line no-await-in-loop
      await dropIndex(db, index);
    }
  },
};
