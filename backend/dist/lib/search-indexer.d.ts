import type { Schema } from 'mongoose';
import { type SearchableEntity } from '../services/search.service.js';
export interface SearchIndexerOptions<T> {
    entity: SearchableEntity;
    project: (doc: T) => Record<string, unknown> & {
        id: string;
    };
}
export declare function searchIndexer<T = any>(schema: Schema, options: SearchIndexerOptions<T>): void;
//# sourceMappingURL=search-indexer.d.ts.map