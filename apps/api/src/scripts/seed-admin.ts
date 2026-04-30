/**
 * Seed (or reset) a known-password admin for local development.
 *
 *   npx tsx apps/api/src/scripts/seed-admin.ts
 *
 * Creates admin user admin@example.com / Admin@123. If the user already exists
 * the password is reset to the known value so you always have working creds
 * after a DB wipe.
 *
 * DO NOT run this in production.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';

const EMAIL = 'admin@example.com';
const PASSWORD = 'Admin@123';

async function seedAdmin(): Promise<void> {
  await connectDatabase();

  let role = await Role.findOne({ slug: 'admin' }).exec();
  if (!role) {
    role = await Role.create({
      name: 'Admin',
      slug: 'admin',
      description: 'Full system access',
      permissions: ['*'],
      isSystem: true,
    });
    logger.info('Created Admin role');
  }

  let user = await User.findOne({ email: EMAIL }).exec();
  if (!user) {
    user = await User.create({
      email: EMAIL,
      password: PASSWORD,
      firstName: 'Admin',
      lastName: 'User',
      role: role._id,
      status: 'active',
      emailVerified: true,
    });
    logger.info(`Created admin user "${EMAIL}"`);
  } else {
    user.password = PASSWORD;
    user.status = 'active';
    user.role = role._id;
    await user.save();
    logger.info(`Reset password for existing user "${EMAIL}"`);
  }

  logger.info('─────────────────────────────────────');
  logger.info('Admin credentials ready');
  logger.info(`   Email:    ${EMAIL}`);
  logger.info(`   Password: ${PASSWORD}`);
  logger.info('─────────────────────────────────────');

  await disconnectDatabase();
}

seedAdmin().catch((err) => {
  logger.error({ err }, 'seed-admin failed');
  process.exit(1);
});
