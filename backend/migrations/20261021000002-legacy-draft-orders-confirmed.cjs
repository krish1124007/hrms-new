/**
 * Legacy `draft` orders become `confirmed`.
 *
 * Before the field rework every order was booked as `draft` and nothing ever
 * moved it on, yet the client ledger (`$inc` on create) and the sales targets
 * counted it as a sale. The new status machine reads `draft` as `pending` —
 * not a receivable, not an achievement — so after the ledger backfill
 * (`scripts/recompute-field-ledgers.ts`) those orders would silently drop out
 * of outstanding balances and targets. Ruling: they were sales, keep them
 * sales. Each one is stamped `metadata.migratedFromDraft: true`; a manager
 * cancels any that was really abandoned.
 *
 * Soft-deleted orders are migrated too (harmless: deleted orders count
 * nowhere) so a restore does not bring a `draft` back.
 *
 * down(): orders still `confirmed` with the stamp go back to `draft`; the
 * stamp is removed from every order (one a manager has since delivered or
 * cancelled keeps that status).
 *
 * Run BEFORE the ledger backfill:  npx migrate-mongo up
 */

const COLLECTION = 'productorders';

module.exports = {
  async up(db) {
    const res = await db
      .collection(COLLECTION)
      .updateMany(
        { status: 'draft' },
        { $set: { status: 'confirmed', 'metadata.migratedFromDraft': true } },
      );
    // eslint-disable-next-line no-console
    console.log(`legacy draft orders → confirmed: ${res.modifiedCount}`);
  },

  async down(db) {
    const col = db.collection(COLLECTION);
    await col.updateMany(
      { status: 'confirmed', 'metadata.migratedFromDraft': true },
      { $set: { status: 'draft' } },
    );
    await col.updateMany(
      { 'metadata.migratedFromDraft': true },
      { $unset: { 'metadata.migratedFromDraft': '' } },
    );
  },
};
