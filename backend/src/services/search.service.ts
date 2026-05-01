import { MeiliSearch, type SearchParams, type Index } from 'meilisearch';
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
] as const;
export type SearchableEntity = (typeof SEARCHABLE_ENTITIES)[number];

let _client: MeiliSearch | null = null;

function getClient(): MeiliSearch {
  if (_client) return _client;
  _client = new MeiliSearch({
    host: env.MEILISEARCH_HOST,
    apiKey: env.MEILISEARCH_API_KEY,
  });
  return _client;
}

function indexName(entity: SearchableEntity): string {
  return `fp_${entity}`;
}

export async function ensureIndex(entity: SearchableEntity): Promise<Index | null> {
  try {
    const client = getClient();
    const name = indexName(entity);
    await client.createIndex(name, { primaryKey: 'id' }).catch(() => undefined);
    const idx = client.index(name);
    return idx;
  } catch (err) {
    logger.warn({ err, entity }, 'Meilisearch ensureIndex failed');
    return null;
  }
}

export async function indexDocuments<T extends { id: string | number }>(
  entity: SearchableEntity,
  documents: T[],
): Promise<void> {
  try {
    const idx = await ensureIndex(entity);
    if (!idx) return;
    await idx.addDocuments(documents);
  } catch (err) {
    logger.warn({ err, entity }, 'Meilisearch indexDocuments failed');
  }
}

export async function removeDocument(
  entity: SearchableEntity,
  docId: string | number,
): Promise<void> {
  try {
    const idx = await ensureIndex(entity);
    if (!idx) return;
    await idx.deleteDocument(docId);
  } catch (err) {
    logger.warn({ err, entity, docId }, 'Meilisearch removeDocument failed');
  }
}

export async function search<T extends Record<string, unknown> = Record<string, unknown>>(
  entity: SearchableEntity,
  query: string,
  params: Omit<SearchParams, 'filter'> & { filter?: string | string[] } = {},
): Promise<{ hits: T[]; total: number }> {
  try {
    const idx = await ensureIndex(entity);
    if (!idx) return { hits: [], total: 0 };

    const res = await idx.search<T>(query, params);
    return { hits: res.hits, total: res.estimatedTotalHits ?? res.hits.length };
  } catch (err) {
    logger.warn({ err, entity }, 'Meilisearch search failed');
    return { hits: [], total: 0 };
  }
}
