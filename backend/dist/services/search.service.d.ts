import { type SearchParams, type Index } from 'meilisearch';
export declare const SEARCHABLE_ENTITIES: readonly ["employees", "customers", "leads", "deals", "products", "tickets", "documents"];
export type SearchableEntity = (typeof SEARCHABLE_ENTITIES)[number];
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