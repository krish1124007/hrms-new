import { indexDocuments, removeDocument } from '../services/search.service.js';
import { logger } from '../config/logger.js';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function searchIndexer(schema, options) {
    const { entity, project } = options;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('save', async function (doc) {
        try {
            if (doc?.isDeleted)
                return;
            await indexDocuments(entity, [project(doc)]);
        }
        catch (err) {
            logger.warn({ err, entity }, 'search indexer: save hook failed');
        }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('findOneAndUpdate', async function (doc) {
        try {
            if (!doc)
                return;
            if (doc.isDeleted) {
                await removeDocument(entity, String(doc._id));
            }
            else {
                await indexDocuments(entity, [project(doc)]);
            }
        }
        catch (err) {
            logger.warn({ err, entity }, 'search indexer: update hook failed');
        }
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schema.post('findOneAndDelete', async function (doc) {
        try {
            if (!doc)
                return;
            await removeDocument(entity, String(doc._id));
        }
        catch (err) {
            logger.warn({ err, entity }, 'search indexer: delete hook failed');
        }
    });
}
//# sourceMappingURL=search-indexer.js.map