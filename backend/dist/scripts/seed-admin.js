/**
 * Bootstrap the first admin user on a fresh install.
 *
 *   ADMIN_EMAIL=you@company.com \
 *   ADMIN_PASSWORD='a strong password' \
 *   ADMIN_FIRST_NAME=Jane \
 *   ADMIN_LAST_NAME=Doe \
 *   npm run seed:admin          (from the backend/ directory)
 *
 * All four ADMIN_* variables are required (set them in the shell or in
 * backend/.env). There are no default credentials. The password must pass the
 * same policy as every other password in the system.
 *
 * Safe to re-run: if a user with that email already exists their password is
 * NEVER touched — the script only makes sure they hold the admin role and are
 * active.
 */
/* eslint-disable no-console -- CLI script: its result must print regardless of LOG_LEVEL */
import 'dotenv/config';
import { z } from 'zod';
import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { User } from '../models/user.model.js';
import { Role } from '../models/role.model.js';
import { ensureSystemRoles } from '../lib/seed-roles.js';
import { validateNewPassword } from '../lib/password-security.js';
const REQUIRED_VARS = ['ADMIN_EMAIL', 'ADMIN_PASSWORD', 'ADMIN_FIRST_NAME', 'ADMIN_LAST_NAME'];
/** Read the ADMIN_* variables; exit(1) with a clear message if any is missing/invalid. */
function readAdminInput() {
    const missing = REQUIRED_VARS.filter((name) => !process.env[name]?.trim());
    if (missing.length > 0) {
        console.error(`Missing required environment variable(s): ${missing.join(', ')}.\n` +
            'Set ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_FIRST_NAME and ADMIN_LAST_NAME, then re-run "npm run seed:admin".');
        process.exit(1);
    }
    const email = process.env.ADMIN_EMAIL.trim().toLowerCase();
    if (!z.string().email().safeParse(email).success) {
        console.error(`ADMIN_EMAIL "${email}" is not a valid email address.`);
        process.exit(1);
    }
    return {
        email,
        // Passwords are taken verbatim — never trimmed.
        password: process.env.ADMIN_PASSWORD,
        firstName: process.env.ADMIN_FIRST_NAME.trim(),
        lastName: process.env.ADMIN_LAST_NAME.trim(),
    };
}
async function seedAdmin() {
    const input = readAdminInput();
    const pwCheck = await validateNewPassword(input.password);
    if (!pwCheck.ok) {
        console.error(`ADMIN_PASSWORD rejected: ${pwCheck.reason ?? 'password does not meet policy'}`);
        process.exit(1);
    }
    await connectDatabase();
    try {
        const { created, refreshed, strippedRoles, strippedUsers } = await ensureSystemRoles();
        console.log(`Roles: ${created} created, ${refreshed} refreshed; retired permissions stripped from ` +
            `${strippedRoles} custom role(s) and ${strippedUsers} user(s)`);
        const adminRole = await Role.findOne({ slug: 'admin' }).orFail().exec();
        const existing = await User.findOne({ email: input.email })
            .setOptions({ withDeleted: true })
            .exec();
        if (existing?.isDeleted) {
            console.error(`A soft-deleted user with email "${input.email}" exists. Restore it or choose a different ADMIN_EMAIL.`);
            process.exitCode = 1;
            return;
        }
        if (existing) {
            // Deliberately a targeted update: the password (and everything else) stays untouched.
            await User.updateOne({ _id: existing._id }, { $set: { role: adminRole._id, status: 'active' } }).exec();
            console.log(`User "${input.email}" already exists — ensured admin role (password unchanged)`);
        }
        else {
            await User.create({
                email: input.email,
                password: input.password,
                firstName: input.firstName,
                lastName: input.lastName,
                role: adminRole._id,
                status: 'active',
                emailVerified: true,
            });
            console.log(`Created admin user "${input.email}"`);
        }
    }
    finally {
        await disconnectDatabase();
    }
}
seedAdmin()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch((err) => {
    console.error('seed-admin failed:', err instanceof Error ? err.message : err);
    process.exit(1);
});
//# sourceMappingURL=seed-admin.js.map