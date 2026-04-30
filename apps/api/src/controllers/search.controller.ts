import type { Request, Response } from 'express';
import { z } from 'zod';
import { search, SEARCHABLE_ENTITIES, type SearchableEntity } from '../services/search.service.js';

/**
 * Global search — hits multiple Meilisearch indexes in parallel and merges
 * results. Powers the `Cmd+K` command palette on the web + the global
 * search bar on mobile.
 *
 *   GET /api/v1/search?q=priya&entities=employees,customers&limit=10
 *
 * Returns per-entity hits so the frontend can group them ("Employees",
 * "Customers") without a second round-trip.
 *
 * Tenant filter is enforced server-side by `services/search.service.ts` —
 * this controller can't accidentally leak cross-tenant matches even if
 * a caller tries to pass `filter=tenantId=other`.
 */

export const searchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  entities: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((s) => s.trim())
            .filter((s): s is SearchableEntity =>
              (SEARCHABLE_ENTITIES as readonly string[]).includes(s),
            )
        : (SEARCHABLE_ENTITIES as unknown as SearchableEntity[]),
    ),
  limit: z.coerce.number().int().positive().max(50).default(8),
});

export async function globalSearch(req: Request, res: Response): Promise<void> {
  const q = req.query as unknown as z.infer<typeof searchQuerySchema>;

  const entities = q.entities as SearchableEntity[];

  const results = await Promise.all(
    entities.map(async (entity) => {
      const { hits, total } = await search(entity, q.q, { limit: q.limit });
      return { entity, hits, total };
    }),
  );

  res.json({
    success: true,
    data: results.filter((r) => r.total > 0),
    meta: { query: q.q, entities },
  });
}
