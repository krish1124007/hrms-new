import { zodToJsonSchema } from 'zod-to-json-schema';
const _schemas = new Map();
export function registerSchema(name, schema) {
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
export function getRegisteredSchemas() {
    const out = {};
    for (const [name, schema] of _schemas.entries()) {
        out[name] = zodToJsonSchema(schema, { target: 'openApi3', name });
        // zodToJsonSchema with `name` nests under `definitions.<name>` — unwrap so
        // the top-level components.schemas.<name> shape matches OpenAPI expectations
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const wrapped = out[name];
        if (wrapped?.$ref && wrapped?.definitions?.[name]) {
            out[name] = wrapped.definitions[name];
        }
    }
    return out;
}
export function _reset() {
    _schemas.clear();
}
//# sourceMappingURL=openapi-registry.js.map