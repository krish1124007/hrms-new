export interface EnsureRolesResult {
    /** Roles that did not exist and were created. */
    created: number;
    /** Existing system roles whose definition had drifted and was rewritten. */
    refreshed: number;
    /** Custom roles that had retired permission names removed. */
    strippedRoles: number;
    /** Users that had retired names removed from `customPermissions`. */
    strippedUsers: number;
}
export declare function ensureSystemRoles(): Promise<EnsureRolesResult>;
//# sourceMappingURL=seed-roles.d.ts.map