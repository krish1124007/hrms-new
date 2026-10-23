/**
 * The one permission catalogue.
 *
 * Every string a route passes to `requirePermission(...)` is listed here, and
 * nothing else is: the Roles UI offers exactly these names (GET /permissions),
 * `createRole` / `updateRole` / `updateUser` reject anything outside them, and
 * the seeded roles in `DEFAULT_ROLES` may only use them. A route that needs a
 * new permission must add it here — `permissions.test.ts` scans
 * `src/routes/**` and fails otherwise.
 *
 * The wildcard `*` (held by the admin role) is deliberately not catalogued: it
 * is not something a role editor can tick, and `ALL_PERMISSIONS` is the set of
 * *grantable* names.
 *
 * `leaves.approve_all`, `expenses.approve_all` and `overtime.approve_all` are the
 * one kind of name no `requirePermission(...)` mentions: the routes stay on the
 * plain `*.approve` (every manager), and `lib/approvals.ts` widens a holder of
 * `*.approve` from "my direct reports' requests" to everybody's when they also
 * hold `*.approve_all`. `permissions.test.ts` knows about and checks them.
 *
 * Keys group the Roles UI by module. They normally equal the prefix of the
 * names beneath them.
 */
export declare const PERMISSIONS_BY_MODULE: Record<string, string[]>;
/** Every grantable permission name — the allow-list role and user editors validate against. */
export declare const ALL_PERMISSIONS: ReadonlySet<string>;
//# sourceMappingURL=permissions.d.ts.map