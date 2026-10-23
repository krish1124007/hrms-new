/**
 * Keeps the built-in roles present and current, and clears retired permission
 * names off stored records. Shared by every seed script (`seed`, `seed:admin`,
 * `seed-users`) so they cannot drift apart.
 *
 * System roles take their name, description and permission list from
 * `DEFAULT_ROLES` — that is their contract — so a code change there reaches
 * existing installs on the next seed with no manual DB edits.
 *
 * Custom roles and users may still hold names that left the catalogue (they
 * were never checked by any route, so removing them changes no access). Those
 * are stripped, each removal logged; `*` and every catalogued name are kept.
 * A name that was *renamed* (`RENAMED_PERMISSIONS`, e.g. `field-sales.view` →
 * `field.view`) is replaced by its new name instead — the access it gave is
 * kept. Users are only ever written through that `customPermissions` clean-up
 * — their credentials, role and every other field are never touched.
 */
import { logger } from '../config/logger.js';
import { ALL_PERMISSIONS } from '../config/permissions.js';
import { Role, DEFAULT_ROLES } from '../models/role.model.js';
import { User } from '../models/user.model.js';
/** Everything a stored permission list may legitimately contain. */
const KEEPABLE = [...ALL_PERMISSIONS, '*'];
const isKeepable = (permission) => permission === '*' || ALL_PERMISSIONS.has(permission);
/**
 * Old name → new name. Migration 20261023000001 renames them in the database;
 * this keeps a seed run that comes first (or a restored backup) from
 * stripping them instead.
 */
export const RENAMED_PERMISSIONS = {
    'field-sales.view': 'field.view',
    'field-sales.manage': 'field.manage',
};
/** `permissions` with renamed names replaced, retired ones dropped, duplicates removed. */
function cleanPermissions(permissions) {
    const kept = [];
    const removed = [];
    const renamed = [];
    for (const permission of permissions) {
        const next = RENAMED_PERMISSIONS[permission] ?? permission;
        if (next !== permission)
            renamed.push(`${permission} → ${next}`);
        if (!isKeepable(next))
            removed.push(permission);
        else if (!kept.includes(next))
            kept.push(next);
    }
    return { kept, removed, renamed };
}
async function upsertSystemRoles(result) {
    for (const definition of DEFAULT_ROLES) {
        const existing = await Role.findOne({ slug: definition.slug }).exec();
        if (!existing) {
            await Role.create({ ...definition });
            result.created += 1;
            logger.info(`Created role "${definition.slug}"`);
            continue;
        }
        if (!definition.isSystem) {
            logger.info(`Role "${definition.slug}" already exists — skipping`);
            continue;
        }
        existing.name = definition.name;
        existing.description = definition.description;
        existing.permissions = [...definition.permissions];
        existing.isSystem = true;
        if (existing.isModified()) {
            await existing.save();
            result.refreshed += 1;
            logger.info(`Refreshed system role "${definition.slug}" (${definition.permissions.length} perms)`);
        }
    }
}
async function stripRetiredFromCustomRoles(result) {
    const stale = await Role.find({
        isSystem: { $ne: true },
        permissions: { $elemMatch: { $nin: KEEPABLE } },
    })
        .select('_id slug permissions')
        .lean()
        .exec();
    for (const role of stale) {
        const { kept, removed, renamed } = cleanPermissions(role.permissions);
        await Role.updateOne({ _id: role._id }, { $set: { permissions: kept } }).exec();
        result.strippedRoles += 1;
        logger.warn({ roleId: String(role._id), slug: role.slug, removed, renamed }, 'Removed retired / renamed permissions on custom role');
    }
}
async function stripRetiredFromUsers(result) {
    // Soft-deleted users too: restoring one must not resurrect a retired name.
    const stale = await User.find({ customPermissions: { $elemMatch: { $nin: KEEPABLE } } })
        .setOptions({ withDeleted: true })
        .select('_id customPermissions')
        .lean()
        .exec();
    for (const user of stale) {
        const { kept, removed, renamed } = cleanPermissions(user.customPermissions);
        await User.updateOne({ _id: user._id }, { $set: { customPermissions: kept } })
            .setOptions({ withDeleted: true })
            .exec();
        result.strippedUsers += 1;
        logger.warn({ userId: String(user._id), removed, renamed }, 'Removed retired / renamed permissions on user customPermissions');
    }
}
export async function ensureSystemRoles() {
    const result = { created: 0, refreshed: 0, strippedRoles: 0, strippedUsers: 0 };
    await upsertSystemRoles(result);
    await stripRetiredFromCustomRoles(result);
    await stripRetiredFromUsers(result);
    return result;
}
//# sourceMappingURL=seed-roles.js.map