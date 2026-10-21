import type { Schema } from 'mongoose';
import { indexDocuments, removeDocument, type SearchableEntity } from '../services/search.service.js';
import { logger } from '../config/logger.js';

export interface SearchIndexerOptions<T> {
  entity: SearchableEntity;
  project: (doc: T) => Record<string, unknown> & { id: string };
}

/**
 * Start a search-index sync and return at once: the hooks below never make
 * a save or update wait for Meilisearch (an async post hook is awaited by
 * Mongoose, so an unreachable index used to add seconds to every write).
 * The sync functions never throw; this catch is belt and braces.
 */
function fireAndForget(task: () => Promise<void>, entity: SearchableEntity, hook: string): void {
  void Promise.resolve()
    .then(task)
    .catch((err) => logger.warn({ err, entity }, `search indexer: ${hook} hook failed`));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function searchIndexer<T = any>(
  schema: Schema,
  options: SearchIndexerOptions<T>,
): void {
  const { entity, project } = options;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const safeProject = (doc: any): (Record<string, unknown> & { id: string }) | null => {
    try {
      return project(doc as T);
    } catch (err) {
      logger.warn({ err, entity }, 'search indexer: projection failed');
      return null;
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('save', function (doc: any) {
    if (!doc || doc.isDeleted) return;
    const projected = safeProject(doc);
    if (projected) fireAndForget(() => indexDocuments(entity, [projected]), entity, 'save');
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('findOneAndUpdate', function (doc: any) {
    if (!doc) return;
    if (doc.isDeleted) {
      const id = String(doc._id);
      fireAndForget(() => removeDocument(entity, id), entity, 'update');
    } else {
      const projected = safeProject(doc);
      if (projected) fireAndForget(() => indexDocuments(entity, [projected]), entity, 'update');
    }
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema.post('findOneAndDelete', function (doc: any) {
    if (!doc) return;
    const id = String(doc._id);
    fireAndForget(() => removeDocument(entity, id), entity, 'delete');
  });
}
