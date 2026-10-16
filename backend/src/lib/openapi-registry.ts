import type { ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Lightweight registry that pairs each Zod validator with its route so we
 * can emit an accurate OpenAPI spec without hand-maintaining JSON.
 *
 * How it integrates:
 *
 *   import { registerSchema } from '../lib/openapi-registry.js';
 *   export const createEmployeeSchema = z.object({ ... });
 *   registerSchema('CreateEmployee', createEmployeeSchema);
 *
 * On startup, `/api/docs` calls `getRegisteredSchemas()` and merges the
 * result into the handwritten swagger config. Any future refactor of
 * `validate()` can push schemas here automatically so docs never drift.
 *
 * This is intentionally minimal — not a replacement for `@asteasolutions/
 * zod-to-openapi`. It keeps the zero-config promise: anything that calls
 * `registerSchema` shows up in the spec without further ceremony.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodSchema = ZodSchema<any, any, any>;

const _schemas = new Map<string, AnyZodSchema>();

export function registerSchema(name: string, schema: AnyZodSchema): void {
  if (_schemas.has(name)) {
    // Allow re-registration in dev (HMR) — warn in prod
    if (process.env.NODE_ENV === 'production') {
      // eslint-disable-next-line no-console
      console.warn(`[openapi-registry] duplicate schema name: ${name}`);
    }
  }
  _schemas.set(name, schema);
}

/** Convert all registered Zod schemas to OpenAPI-compatible JSON Schema. */
export function getRegisteredSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, schema] of _schemas.entries()) {
    out[name] = zodToJsonSchema(schema, { target: 'openApi3', name });
    // zodToJsonSchema with `name` nests under `definitions.<name>` — unwrap so
    // the top-level components.schemas.<name> shape matches OpenAPI expectations
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const wrapped = out[name] as any;
    if (wrapped?.$ref && wrapped?.definitions?.[name]) {
      out[name] = wrapped.definitions[name];
    }
  }
  return out;
}

export function _reset(): void {
  _schemas.clear();
}
