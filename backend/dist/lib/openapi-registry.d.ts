import type { ZodSchema } from 'zod';
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
type AnyZodSchema = ZodSchema<any, any, any>;
export declare function registerSchema(name: string, schema: AnyZodSchema): void;
/** Convert all registered Zod schemas to OpenAPI-compatible JSON Schema. */
export declare function getRegisteredSchemas(): Record<string, unknown>;
export declare function _reset(): void;
export {};
//# sourceMappingURL=openapi-registry.d.ts.map