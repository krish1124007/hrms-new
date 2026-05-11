import { MeiliSearch } from 'meilisearch';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
export const SEARCHABLE_ENTITIES = [
    'employees',
    'customers',
    'leads',
    'deals',
    'products',
    'tickets',
    'documents',
];
let _client = null;
function getClient() {
    if (_client)
        return _client;
    _client = new MeiliSearch({
        host: env.MEILISEARCH_HOST,
        apiKey: env.MEILISEARCH_API_KEY,
    });
    return _client;
}
function indexName(entity) {
    return `fp_${entity}`;
}
export async function ensureIndex(entity) {
    try {
        const client = getClient();
        const name = indexName(entity);
        await client.createIndex(name, { primaryKey: 'id' }).catch(() => undefined);
        const idx = client.index(name);
        return idx;
    }
    catch (err) {
        logger.warn({ err, entity }, 'Meilisearch ensureIndex failed');
        return null;
    }
}
export async function indexDocuments(entity, documents) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx)
            return;
        await idx.addDocuments(documents);
    }
    catch (err) {
        logger.warn({ err, entity }, 'Meilisearch indexDocuments failed');
    }
}
export async function removeDocument(entity, docId) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx)
            return;
        await idx.deleteDocument(docId);
    }
    catch (err) {
        logger.warn({ err, entity, docId }, 'Meilisearch removeDocument failed');
    }
}
export async function search(entity, query, params = {}) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx)
            return { hits: [], total: 0 };
        const res = await idx.search(query, params);
        return { hits: res.hits, total: res.estimatedTotalHits ?? res.hits.length };
    }
    catch (err) {
        logger.warn({ err, entity }, 'Meilisearch search failed');
        return { hits: [], total: 0 };
    }
}
//# sourceMappingURL=search.service.js.map