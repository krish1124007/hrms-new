/**
 * User text in a regular expression.
 *
 * Every `?search=` (and every imported name matched case-insensitively) goes
 * through `escapeRegex` before it becomes a `RegExp` or a `$regex`: unescaped,
 * `(a+)+$` is a ReDoS against the database, `.*` matches everything and `[`
 * is a 500.
 */

/** Escape `text` so it matches itself literally inside a regular expression. */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * A case-insensitive "contains" match for a query value — `?search=` may
 * arrive as an array (`?search=a&search=b`); its first element is used.
 */
export function containsInsensitive(value: unknown): RegExp {
  const text = Array.isArray(value) ? String(value[0] ?? '') : String(value ?? '');
  return new RegExp(escapeRegex(text), 'i');
}
