/**
 * Location-track retention keys on the server's clock.
 *
 * `locationtracks` used to expire on `timestamp` — the time the phone said it
 * took the fix — so a device with a wrong clock decided how long its own
 * location history was kept. Fixes now carry a server-side `receivedAt` and
 * the 90-day TTL keys on that.
 *
 *  1. Backfill `receivedAt` on existing fixes (the old `syncedAt`, which was
 *     already the server's receive time, else `timestamp`).
 *  2. Drop the TTL index on `timestamp` (`timestamp_1`).
 *  3. Build the `receivedAt` TTL index and a plain `timestamp` index for the
 *     live map's "latest fix of the last 2 h" query.
 *
 * autoIndex is off in production, so the indexes have to be built here.
 *
 * Run with:  npx migrate-mongo up
 */

const COLLECTION = 'locationtracks';
const RETENTION_SECONDS = 60 * 60 * 24 * 90;

async function indexNames(col) {
  try {
    return (await col.indexes()).map((ix) => ix.name);
  } catch (err) {
    // A database that has never stored a fix has no collection yet.
    if (err && err.codeName === 'NamespaceNotFound') return [];
    throw err;
  }
}

module.exports = {
  async up(db) {
    const col = db.collection(COLLECTION);

    await col.updateMany({ receivedAt: { $exists: false } }, [
      { $set: { receivedAt: { $ifNull: ['$syncedAt', '$timestamp'] } } },
    ]);

    const names = await indexNames(col);
    if (names.includes('timestamp_1')) await col.dropIndex('timestamp_1');

    await col.createIndex(
      { receivedAt: 1 },
      { name: 'receivedAt_1', expireAfterSeconds: RETENTION_SECONDS },
    );
    await col.createIndex({ timestamp: -1 }, { name: 'timestamp_-1' });
  },

  async down(db) {
    const col = db.collection(COLLECTION);
    const names = await indexNames(col);
    if (names.includes('receivedAt_1')) await col.dropIndex('receivedAt_1');
    if (names.includes('timestamp_-1')) await col.dropIndex('timestamp_-1');
    await col.createIndex(
      { timestamp: 1 },
      { name: 'timestamp_1', expireAfterSeconds: RETENTION_SECONDS },
    );
    // `receivedAt` values are left in place: the previous code ignores the
    // field, and removing it would lose the receive time of new fixes.
  },
};
