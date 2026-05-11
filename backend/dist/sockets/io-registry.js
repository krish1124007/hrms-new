/**
 * Module-level holder for the Socket.io Server instance.
 *
 * `index.ts` calls `setIO(io)` after constructing the server. Services
 * that need to push events (e.g. `notification.service.ts`) then call
 * `getIO()` without having to thread the instance through every caller.
 *
 * Tests/CLI processes that don't start a socket server get `null` from
 * `getIO()` — callers should treat that as "fire-and-forget skipped".
 */
let _io = null;
export function setIO(io) {
    _io = io;
}
export function getIO() {
    return _io;
}
//# sourceMappingURL=io-registry.js.map