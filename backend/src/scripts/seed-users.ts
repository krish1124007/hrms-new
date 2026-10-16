/**
 * Seed sample users (one per role) for local development.
 *
 *   npx tsx apps/api/src/scripts/seed-users.ts
 *
 * Pre-req: run `seed-admin.ts` first so the Admin role exists.
 *
 * All users share password `Demo@123`. DO NOT run in production.
 */
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { logger } from '../config/logger.js';
import { User } from '../models/user.model.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';
import { Employee } from '../models/employee.model.js';

const PASSWORD = 'Demo@123';

interface SeedSpec {
  email: string;
  firstName: string;
  lastName: string;
  roleSlug: string;
  withEmployee: boolean;
}

const SPECS: SeedSpec[] = [
  { email: 'admin2@example.com',  firstName: 'Alex',  lastName: 'Admin',    roleSlug: 'admin',        withEmployee: false },
  { email: 'hrmanager@example.com', firstName: 'Hira',  lastName: 'Manager',  roleSlug: 'hr_manager',   withEmployee: true  },
  { email: 'hr@example.com',         firstName: 'Hema',  lastName: 'Executive',roleSlug: 'hr_executive', withEmployee: true  },
  { email: 'manager@example.com',    firstName: 'Mia',   lastName: 'Manager',  roleSlug: 'manager',      withEmployee: true  },
  { email: 'employee@example.com',   firstName: 'Evan',  lastName: 'Employee', roleSlug: 'employee',     withEmployee: true  },
];

async function seedUsers(): Promise<void> {
  await connectDatabase();

  for (const r of DEFAULT_ROLES) {
    const existing = await Role.findOne({ slug: r.slug }).exec();
    if (!existing) {
      await Role.create({ ...r });
      logger.info(`Created role "${r.slug}"`);
    }
  }

  const allRoles = await Role.find().exec();
  const roleBySlug = new Map(allRoles.map((r) => [r.slug, r]));

  for (const spec of SPECS) {
    const role = roleBySlug.get(spec.roleSlug);
    if (!role) {
      logger.warn(`Role "${spec.roleSlug}" missing — skipping ${spec.email}`);
      continue;
    }

    let user = await User.findOne({ email: spec.email }).exec();
    if (!user) {
      user = await User.create({
        email: spec.email,
        password: PASSWORD,
        firstName: spec.firstName,
        lastName: spec.lastName,
        role: role._id,
        status: 'active',
        emailVerified: true,
        uid: spec.email,
      });
      logger.info(`Created user "${spec.email}" [${spec.roleSlug}]`);
    } else {
      user.password = PASSWORD;
      user.role = role._id;
      user.status = 'active';
      await user.save();
      logger.info(`Reset password for "${spec.email}" [${spec.roleSlug}]`);
    }

    if (spec.withEmployee) {
      const existingEmp = await Employee.findOne({
        $or: [{ userId: user._id }, { email: spec.email }],
      }).exec();
      if (!existingEmp) {
        await Employee.create({
          userId: user._id,
          firstName: spec.firstName,
          lastName: spec.lastName,
          email: spec.email,
          joiningDate: new Date(),
          employmentType: 'full-time',
          status: 'active',
        });
        logger.info(`  ↳ Created Employee record for ${spec.email}`);
      } else if (!existingEmp.userId) {
        existingEmp.userId = user._id as unknown as typeof existingEmp.userId;
        await existingEmp.save();
        logger.info(`  ↳ Linked existing Employee to user ${spec.email}`);
      }
    }
  }

  logger.info('─────────────────────────────────────');
  logger.info('Seeded users');
  logger.info(`   Password (all users): ${PASSWORD}`);
  for (const s of SPECS) {
    logger.info(`   ${s.roleSlug.padEnd(14)} → ${s.email}`);
  }
  logger.info('─────────────────────────────────────');

  await disconnectDatabase();
}

seedUsers().catch((err) => {
  logger.error({ err }, 'seed-users failed');
  process.exit(1);
});
