/**
 * Loads the admin-configured week-off rule.
 *
 * The rule is read on nearly every attendance/leave request but changes maybe
 * once a year, so it is cached in-process for a short TTL. `updateConfig`
 * calls `invalidateWeekOffRule()` so a save takes effect immediately rather
 * than after the TTL.
 */
import { AttendanceConfig } from '../models/attendance-config.model.js';
import { DEFAULT_WEEK_OFF_RULE } from '../lib/week-off.js';
import { logger } from '../config/logger.js';
const TTL_MS = 60_000;
let cached = null;
let cachedAt = 0;
/** Drop the cache so the next read picks up a freshly saved rule. */
export function invalidateWeekOffRule() {
    cached = null;
    cachedAt = 0;
}
/**
 * The configured rule, or the default when nothing has been saved yet.
 * Never throws — a DB hiccup falls back to the default rather than breaking
 * every attendance screen.
 */
export async function getWeekOffRule() {
    if (cached && Date.now() - cachedAt < TTL_MS)
        return cached;
    try {
        const cfg = await AttendanceConfig.findOne({}).select('weekOff').lean().exec();
        const wo = cfg?.weekOff;
        cached = {
            fullDaysOff: wo?.fullDaysOff ?? DEFAULT_WEEK_OFF_RULE.fullDaysOff,
            partialDaysOff: wo?.partialDaysOff ?? DEFAULT_WEEK_OFF_RULE.partialDaysOff,
        };
        cachedAt = Date.now();
        return cached;
    }
    catch (err) {
        logger.warn({ err }, 'Week-off rule lookup failed — falling back to the default');
        return DEFAULT_WEEK_OFF_RULE;
    }
}
//# sourceMappingURL=week-off.service.js.map