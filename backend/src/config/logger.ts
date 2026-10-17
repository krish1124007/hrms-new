import pino, { type LoggerOptions } from 'pino';
import { env } from './env.js';

/**
 * Exported so the redaction rules can be exercised in a test against an
 * in-memory destination (see logger.test.ts).
 *
 * pino-http serialises every request/response into `req.headers` /
 * `res.headers`; without `redact` the bearer token and session cookies land in
 * the log aggregator on every single request.
 */
export const loggerOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
  ...(env.NODE_ENV === 'development'
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:HH:MM:ss.l',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
};

export const logger = pino(loggerOptions);
