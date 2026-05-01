/**
 * Baseline migration — records the current schema state as "migration zero".
 *
 * All future schema changes (add index, add field default, backfill data)
 * go in new files named `YYYYMMDDHHMMSS-description.cjs`.
 *
 * Run on new environments with:  npx migrate-mongo up
 *
 * @ALLOW_NOOP_DOWN  Baseline has nothing to roll back to — this is the
 * starting point. Every future migration MUST implement a non-trivial down().
 */

module.exports = {
  async up(_db, _client) {
    // Baseline — nothing to do. This file marks the starting point so
    // subsequent migrations know what's already applied.
    return Promise.resolve();
  },

  async down(_db, _client) {
    // No-op — baseline cannot be rolled back.
    return Promise.resolve();
  },
};
