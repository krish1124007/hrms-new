import { AsyncLocalStorage } from 'node:async_hooks';
const storage = new AsyncLocalStorage();
export function runWithContext(ctx, fn) {
    return storage.run(ctx, fn);
}
export function getContext() {
    return storage.getStore();
}
export function setContext(patch) {
    const current = storage.getStore();
    if (current)
        Object.assign(current, patch);
}
export function getUserId() {
    const ctx = getContext();
    return ctx?.userId ? String(ctx.userId) : undefined;
}
//# sourceMappingURL=async-context.js.map