import { indexDocuments, removeDocument } from '../services/search.service.js';
import { logger } from '../config/logger.js';
/**
 * Start a search-index sync and return at once: the hooks below never make
 * a save or update wait for Meilisearch (an async post hook is awaited by
 * Mongoose, so an unreachable index used to add seconds to every write).
 * The sync functions never throw; this catch is belt and braces.
 */
function fireAndForget(task, entity, hook) {
    void Promise.resolve()
        .then(task)
        .catch((err) => logger.warn({ err, entity }, `search indexer: ${hook} hook failed`));
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function searchIndexer(schema, options) {
    const { entity, project } = options;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const safeProject = (doc) => {
        try {
            return project(doc);
        }
        catch (err) {
            logger.warn({ err, entity }, 'search indexer: projection failed');
            return null;
        }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('save', function (doc) {
        if (!doc || doc.isDeleted)
            return;
        const projected = safeProject(doc);
        if (projected)
            fireAndForget(() => indexDocuments(entity, [projected]), entity, 'save');
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('findOneAndUpdate', function (doc) {
        if (!doc)
            return;
        if (doc.isDeleted) {
            const id = String(doc._id);
            fireAndForget(() => removeDocument(entity, id), entity, 'update');
        }
        else {
            const projected = safeProject(doc);
            if (projected)
                fireAndForget(() => indexDocuments(entity, [projected]), entity, 'update');
        }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('findOneAndDelete', function (doc) {
        if (!doc)
            return;
        const id = String(doc._id);
        fireAndForget(() => removeDocument(entity, id), entity, 'delete');
    });
}
//# sourceMappingURL=search-indexer.js.map