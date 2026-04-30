/**
 * Seed script — creates the default roles for a fresh install.
 *
 * Run with:  npm --workspace=@opencore/api run seed
 *            (or)  npx tsx apps/api/src/scripts/seed.ts
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';

async function seed(): Promise<void> {
  await connectDatabase();

  for (const r of DEFAULT_ROLES) {
    const existing = await Role.findOne({ slug: r.slug }).exec();
    if (existing) {
      // System-managed roles (admin, hr_manager, hr_executive, manager,
      // employee) take their permission list from this file — that's their
      // contract. Refresh on every seed so a code change here propagates
      // to existing installs without manual DB edits.
      if (r.isSystem) {
        existing.name = r.name;
        existing.description = r.description;
        existing.permissions = r.permissions;
        existing.isSystem = true;
        await existing.save();
        logger.info(`Refreshed system role "${r.slug}" (${r.permissions.length} perms)`);
      } else {
        logger.info(`Role "${r.slug}" already exists — skipping`);
      }
      continue;
    }
    await Role.create({ ...r });
    logger.info(`Created role "${r.slug}"`);
  }

  logger.info('Seed complete');
  await disconnectDatabase();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
