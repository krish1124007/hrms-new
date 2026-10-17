/**
 * Keeps the built-in roles present and current. Shared by every seed script
 * (`seed`, `seed:admin`, `seed-users`) so they cannot drift apart.
 *
 * System roles take their name, description and permission list from
 * `DEFAULT_ROLES` — that is their contract — so a code change there reaches
 * existing installs on the next seed with no manual DB edits. Only roles are
 * written: users (and their `role` / `customPermissions`) are never touched.
 */
import { logger } from '../config/logger.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';

export interface EnsureRolesResult {
  /** Roles that did not exist and were created. */
  created: number;
  /** Existing system roles whose definition had drifted and was rewritten. */
  refreshed: number;
}

export async function ensureSystemRoles(): Promise<EnsureRolesResult> {
  const result: EnsureRolesResult = { created: 0, refreshed: 0 };

  for (const definition of DEFAULT_ROLES) {
    const existing = await Role.findOne({ slug: definition.slug }).exec();

    if (!existing) {
      await Role.create({ ...definition });
      result.created += 1;
      logger.info(`Created role "${definition.slug}"`);
      continue;
    }

    if (!definition.isSystem) {
      logger.info(`Role "${definition.slug}" already exists — skipping`);
      continue;
    }

    existing.name = definition.name;
    existing.description = definition.description;
    existing.permissions = [...definition.permissions];
    existing.isSystem = true;
    if (existing.isModified()) {
      await existing.save();
      result.refreshed += 1;
      logger.info(
        `Refreshed system role "${definition.slug}" (${definition.permissions.length} perms)`,
      );
    }
  }

  return result;
}
