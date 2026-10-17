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
import 'dotenv/config';
//# sourceMappingURL=seed-admin.d.ts.map