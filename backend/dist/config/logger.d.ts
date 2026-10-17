import pino, { type LoggerOptions } from 'pino';
/**
 * Exported so the redaction rules can be exercised in a test against an
 * in-memory destination (see logger.test.ts).
 *
 * pino-http serialises every request/response into `req.headers` /
 * `res.headers`; without `redact` the bearer token and session cookies land in
 * the log aggregator on every single request.
 */
export declare const loggerOptions: LoggerOptions;
export declare const logger: pino.Logger<never, boolean>;
//# sourceMappingURL=logger.d.ts.map