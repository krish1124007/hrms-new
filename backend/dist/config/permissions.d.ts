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
 * Keys group the Roles UI by module. They normally equal the prefix of the
 * names beneath them; `field` groups the `field-sales.*` permissions.
 */
export declare const PERMISSIONS_BY_MODULE: Record<string, string[]>;
/** Every grantable permission name — the allow-list role and user editors validate against. */
export declare const ALL_PERMISSIONS: ReadonlySet<string>;
//# sourceMappingURL=permissions.d.ts.map