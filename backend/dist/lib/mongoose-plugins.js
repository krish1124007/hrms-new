import { Types } from 'mongoose';
/* ──────────────────────────────────────────────────────────────
 * schemaVersionPlugin
 *   Stamps every document with the model's current `schemaVersion`
 *   on save. Enables online migrations: a worker can target
 *   `{ schemaVersion: { $lt: N } }` and backfill only stale docs
 *   instead of re-touching everything.
 *
 * Usage:
 *   schema.plugin(schemaVersionPlugin, { version: 2 });
 *   // all new docs get schemaVersion=2;
 *   // existing docs keep their prior value until a migration bumps them.
 * ────────────────────────────────────────────────────────────── */
export function schemaVersionPlugin(schema, options = { version: 1 }) {
    schema.add({
        schemaVersion: { type: Number, default: options.version, index: true },
    });
    schema.pre('save', function (next) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = this;
        if (doc.schemaVersion === undefined)
            doc.schemaVersion = options.version;
        next();
    });
}
/* ──────────────────────────────────────────────────────────────
 * timestampPlugin — adds createdAt/updatedAt automatically.
 * (Mongoose has this built-in, but we expose it as a plugin so
 * the project conventions are explicit and consistent.)
 * ────────────────────────────────────────────────────────────── */
export function timestampPlugin(schema) {
    schema.set('timestamps', true);
}
/* ──────────────────────────────────────────────────────────────
 * softDeletePlugin
 *   Adds deletedAt + isDeleted, hides soft-deleted docs from
 *   default queries, and exposes restore()/withDeleted helpers.
 * ────────────────────────────────────────────────────────────── */
export function softDeletePlugin(schema) {
    schema.add({
        deletedAt: { type: Date, default: null },
        isDeleted: { type: Boolean, default: false, index: true },
        /** User ID of the person who performed the delete. Audit trail. */
        deletedBy: { type: Types.ObjectId, ref: 'User', default: null },
        /** Reason given for the deletion (compliance / audit). */
        deleteReason: { type: String, default: null },
    });
    const excludeDeleted = function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const opts = this.getOptions();
        if (opts?.withDeleted)
            return;
        const filter = this.getFilter();
        // Always enforce isDeleted:{$ne:true} UNLESS the caller explicitly
        // opted-in to including deleted docs. Previously we honoured a
        // caller-supplied `isDeleted:true` filter (for "show me trash"),
        // but that made it trivial to forget the filter in a `findOne({_id})`
        // and accidentally hand a soft-deleted document to the app.
        //
        // The new rule: the filter is ALWAYS applied. If you want the trash
        // view, pass `{ withDeleted: true }` in the query options explicitly —
        // which shows up in code review instead of being a silent bypass.
        if (filter.isDeleted === undefined) {
            this.where({ isDeleted: { $ne: true } });
        }
        else {
            // Caller tried to filter by isDeleted explicitly — warn in dev
            // to nudge them toward withDeleted, but don't break.
            // eslint-disable-next-line no-console
            if (process.env.NODE_ENV !== 'production') {
                console.warn('[softDelete] explicit isDeleted filter detected — use { withDeleted: true } option instead for clarity');
            }
        }
    };
    schema.pre(/^find/, excludeDeleted);
    schema.pre('countDocuments', excludeDeleted);
    schema.pre(/^update/, excludeDeleted);
    schema.pre(/^delete/, excludeDeleted);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.methods.softDelete = async function (options) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = this;
        doc.isDeleted = true;
        doc.deletedAt = new Date();
        if (options?.by)
            doc.deletedBy = options.by;
        if (options?.reason)
            doc.deleteReason = options.reason;
        await doc.save();
    };
    schema.methods.restore = async function () {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const doc = this;
        doc.isDeleted = false;
        doc.deletedAt = null;
        doc.deletedBy = null;
        doc.deleteReason = null;
        await doc.save();
    };
}
export function paginatePlugin(schema) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.statics.paginate = async function (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filter = {}, options = {}) {
        const page = Math.max(1, options.page ?? 1);
        const limit = Math.min(100, Math.max(1, options.limit ?? 20));
        const skip = (page - 1) * limit;
        const query = this.find(filter).skip(skip).limit(limit);
        if (options.sort)
            query.sort(options.sort);
        if (options.populate)
            query.populate(options.populate);
        if (options.select)
            query.select(options.select);
        const [data, total] = await Promise.all([query.exec(), this.countDocuments(filter)]);
        return {
            data,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit) || 1,
            },
        };
    };
}
//# sourceMappingURL=mongoose-plugins.js.map