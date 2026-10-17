/**
 * Seed script — creates the default roles for a fresh install.
 *
 * Run with:  npm run seed   (from the backend/ directory)
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { ensureSystemRoles } from '../lib/seed-roles.js';

async function seed(): Promise<void> {
  await connectDatabase();

  const { created, refreshed, strippedRoles, strippedUsers } = await ensureSystemRoles();
  logger.info(
    `Roles: ${created} created, ${refreshed} refreshed; retired permissions stripped from ` +
      `${strippedRoles} custom role(s) and ${strippedUsers} user(s)`,
  );

  logger.info('Seed complete');
  await disconnectDatabase();
}

seed().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
