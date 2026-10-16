import type { Schema } from 'mongoose';
import { indexDocuments, removeDocument, type SearchableEntity } from '../services/search.service.js';
import { logger } from '../config/logger.js';

export interface SearchIndexerOptions<T> {
  entity: SearchableEntity;
  project: (doc: T) => Record<string, unknown> & { id: string };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function searchIndexer<T = any>(
  schema: Schema,
  options: SearchIndexerOptions<T>,
): void {
  const { entity, project } = options;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('save', async function (doc: any) {
    try {
      if (doc?.isDeleted) return;
      await indexDocuments(entity, [project(doc as T)]);
    } catch (err) {
      logger.warn({ err, entity }, 'search indexer: save hook failed');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('findOneAndUpdate', async function (doc: any) {
    try {
      if (!doc) return;
      if (doc.isDeleted) {
        await removeDocument(entity, String(doc._id));
      } else {
        await indexDocuments(entity, [project(doc as T)]);
      }
    } catch (err) {
      logger.warn({ err, entity }, 'search indexer: update hook failed');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('findOneAndDelete', async function (doc: any) {
    try {
      if (!doc) return;
      await removeDocument(entity, String(doc._id));
    } catch (err) {
      logger.warn({ err, entity }, 'search indexer: delete hook failed');
    }
  });
}
