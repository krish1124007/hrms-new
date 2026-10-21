/**
 * Meilisearch: the global search index.
 *
 * Search is a convenience, never on the critical path:
 *   • every call has a short timeout (SEARCH_TIMEOUT_MS) — an unreachable
 *     host costs at most that, not the HTTP client's default;
 *   • a circuit breaker opens after SEARCH_BREAKER_THRESHOLD consecutive
 *     failures and then skips Meilisearch entirely for
 *     SEARCH_BREAKER_COOLDOWN_MS (one probe call after that) — a server
 *     without Meilisearch (production `.env` long had no MEILISEARCH_*) pays
 *     nothing per request;
 *   • indexing (`lib/search-indexer.ts`) is fire-and-forget: a create or
 *     update never waits for it;
 *   • `search()` answers an empty result (with a warning) when the index is
 *     down, and none of these functions ever throws.
 */
import { MeiliSearch } from 'meilisearch';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { CircuitOpenError, circuitBreaker } from '../lib/circuit-breaker.js';
export const SEARCHABLE_ENTITIES = [
    'employees',
    'customers',
    'leads',
    'deals',
    'products',
    'tickets',
    'documents',
];
/** Longest any one Meilisearch call may take. */
export const SEARCH_TIMEOUT_MS = 500;
/** Consecutive failures that open the breaker. */
export const SEARCH_BREAKER_THRESHOLD = 3;
/** How long an open breaker skips Meilisearch before probing again. */
export const SEARCH_BREAKER_COOLDOWN_MS = 60_000;
export const SEARCH_BREAKER = 'meilisearch';
const breaker = () => circuitBreaker(SEARCH_BREAKER, {
    threshold: SEARCH_BREAKER_THRESHOLD,
    cooldownMs: SEARCH_BREAKER_COOLDOWN_MS,
    timeoutMs: SEARCH_TIMEOUT_MS,
});
let _client = null;
function getClient() {
    if (_client)
        return _client;
    _client = new MeiliSearch({
        host: env.MEILISEARCH_HOST,
        apiKey: env.MEILISEARCH_API_KEY,
        timeout: SEARCH_TIMEOUT_MS,
    });
    return _client;
}
function indexName(entity) {
    return `fp_${entity}`;
}
/** Indexes already created (or found to exist) in this process. */
const ensured = new Set();
/** A failure worth a warning; an open breaker (Meilisearch known to be down) only a debug line. */
function logFailure(err, context, msg) {
    if (err instanceof CircuitOpenError)
        logger.debug({ ...context }, `${msg} (search index unavailable)`);
    else
        logger.warn({ err, ...context }, msg);
}
export async function ensureIndex(entity) {
    try {
        const client = getClient();
        const name = indexName(entity);
        if (!ensured.has(entity)) {
            await breaker().run(async () => {
                try {
                    await client.createIndex(name, { primaryKey: 'id' });
                }
                catch (err) {
                    // An index that already exists is fine; anything else is a failure.
                    const code = err?.cause?.code ?? err?.code;
                    if (code !== 'index_already_exists')
                        throw err;
                }
            });
            ensured.add(entity);
        }
        return client.index(name);
    }
    catch (err) {
        logFailure(err, { entity }, 'Meilisearch ensureIndex failed');
        return null;
    }
}
export async function indexDocuments(entity, documents) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx)
            return;
        await breaker().run(() => idx.addDocuments(documents));
    }
    catch (err) {
        logFailure(err, { entity }, 'Meilisearch indexDocuments failed');
    }
}
export async function removeDocument(entity, docId) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx)
            return;
        await breaker().run(() => idx.deleteDocument(docId));
    }
    catch (err) {
        logFailure(err, { entity, docId }, 'Meilisearch removeDocument failed');
    }
}
export async function search(entity, query, params = {}) {
    try {
        const idx = await ensureIndex(entity);
        if (!idx) {
            logger.warn({ entity }, 'Meilisearch unavailable — search answers no results');
            return { hits: [], total: 0 };
        }
        const res = await breaker().run(() => idx.search(query, params));
        return { hits: res.hits, total: res.estimatedTotalHits ?? res.hits.length };
    }
    catch (err) {
        logger.warn({ err, entity }, 'Meilisearch search failed — search answers no results');
        return { hits: [], total: 0 };
    }
}
//# sourceMappingURL=search.service.js.map