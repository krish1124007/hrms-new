import { stripMongoOperators } from '../lib/sanitize.js';
/**
 * Global input sanitizer.
 *
 * - Strips MongoDB operators (`$ne`, `$gt`, dotted-path attacks) from
 *   every request body and query parameter.
 * - HTML sanitization is NOT applied here — it's opt-in at the controller
 *   level via `sanitizeRich/Basic/Strict` helpers, because per-field context
 *   matters (a "notice content" needs rich HTML; a "name" should be strict).
 */
export function sanitizeInputs(req, _res, next) {
    if (req.body && typeof req.body === 'object') {
        req.body = stripMongoOperators(req.body);
    }
    // req.query in Express 5 is a getter — mutate in place instead of reassigning
    if (req.query && typeof req.query === 'object') {
        const cleaned = stripMongoOperators(req.query);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const q = req.query;
        for (const k of Object.keys(q))
            delete q[k];
        Object.assign(q, cleaned);
    }
    next();
}
//# sourceMappingURL=sanitize.middleware.js.map