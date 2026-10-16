import express, { type RequestHandler } from 'express';
/**
 * Per-route request-body size cap.
 *
 * The global `express.json({ limit: '10mb' })` is permissive because a few
 * endpoints legitimately accept large payloads (bulk-import CSV parsed to
 * JSON, rich-text notes with embedded images). Most endpoints don't —
 * a login body should never exceed a few kilobytes.
 *
 * `bodyLimit('100kb')` mounted on a specific route overrides the global
 * parser with a tighter limit, so a `POST /auth/login` can't be used as a
 * memory-exhaustion vector by sending a 10mb JSON blob.
 *
 * Usage:
 *   router.post('/login', bodyLimit('100kb'), validate(loginSchema), handler);
 *
 * The middleware runs a fresh `express.json` parser — Express already
 * parsed the body once with the global limit, but re-parsing is cheap
 * and lets each route set its own ceiling.
 */
export declare function bodyLimit(limit: string): RequestHandler;
/** Pre-canned standard limits so routes don't have to remember exact strings. */
export declare const TIGHT_JSON: express.RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const STANDARD_JSON: express.RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
export declare const LARGE_JSON: express.RequestHandler<import("express-serve-static-core").ParamsDictionary, any, any, import("qs").ParsedQs, Record<string, any>>;
//# sourceMappingURL=body-limit.middleware.d.ts.map