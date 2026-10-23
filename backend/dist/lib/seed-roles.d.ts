export interface EnsureRolesResult {
    /** Roles that did not exist and were created. */
    created: number;
    /** Existing system roles whose definition had drifted and was rewritten. */
    refreshed: number;
    /** Custom roles that had retired permission names removed (or renamed ones replaced). */
    strippedRoles: number;
    /** Users that had retired names removed from (or renamed ones replaced in) `customPermissions`. */
    strippedUsers: number;
}
/**
 * Old name → new name. Migration 20261023000001 renames them in the database;
 * this keeps a seed run that comes first (or a restored backup) from
 * stripping them instead.
 */
export declare const RENAMED_PERMISSIONS: Readonly<Record<string, string>>;
export declare function ensureSystemRoles(): Promise<EnsureRolesResult>;
//# sourceMappingURL=seed-roles.d.ts.map