/**
 * Keys older builds wrote to `localStorage` that must not linger: the "Add
 * employee" form once kept its whole draft there — passwords, bank details
 * and salary included. Today's draft lives in `sessionStorage` without them.
 */
export const LEGACY_LOCAL_STORAGE_KEYS = ['opencore.employee.draft'] as const;

/** Remove every legacy key; called once at startup (`main.tsx`). */
export function purgeLegacyStorage(storage: Pick<Storage, 'removeItem'> | undefined = globalThis.localStorage): void {
  if (!storage) return;
  for (const key of LEGACY_LOCAL_STORAGE_KEYS) {
    try {
      storage.removeItem(key);
    } catch {
      // Storage unavailable (private mode) — nothing was kept there either.
    }
  }
}
