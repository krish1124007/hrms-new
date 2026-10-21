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
import { type SearchParams, type Index } from 'meilisearch';
export declare const SEARCHABLE_ENTITIES: readonly ["employees", "customers", "leads", "deals", "products", "tickets", "documents"];
export type SearchableEntity = (typeof SEARCHABLE_ENTITIES)[number];
/** Longest any one Meilisearch call may take. */
export declare const SEARCH_TIMEOUT_MS = 500;
/** Consecutive failures that open the breaker. */
export declare const SEARCH_BREAKER_THRESHOLD = 3;
/** How long an open breaker skips Meilisearch before probing again. */
export declare const SEARCH_BREAKER_COOLDOWN_MS = 60000;
export declare const SEARCH_BREAKER = "meilisearch";
export declare function ensureIndex(entity: SearchableEntity): Promise<Index | null>;
export declare function indexDocuments<T extends {
    id: string | number;
}>(entity: SearchableEntity, documents: T[]): Promise<void>;
export declare function removeDocument(entity: SearchableEntity, docId: string | number): Promise<void>;
export declare function search<T extends Record<string, unknown> = Record<string, unknown>>(entity: SearchableEntity, query: string, params?: Omit<SearchParams, 'filter'> & {
    filter?: string | string[];
}): Promise<{
    hits: T[];
    total: number;
}>;
//# sourceMappingURL=search.service.d.ts.map