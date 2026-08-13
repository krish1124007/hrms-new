import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../lib/errors.js';
import { CircuitOpenError } from '../lib/circuit-breaker.js';
import { Sentry } from '../lib/sentry.js';
import { audit } from '../services/audit.service.js';
/**
 * Failures that say nothing about a real problem — an expired access token is
 * routine (the client refreshes and retries), and logging every one would bury
 * the failures worth reading.
 */
const NOISY_CODES = new Set(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'UNAUTHORIZED']);
export function errorMiddleware(err, req, res, 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
_next) {
    let statusCode = 500;
    let payload = {
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
    };
    if (err instanceof CircuitOpenError) {
        statusCode = err.statusCode;
        payload = {
            success: false,
            error: { code: err.code, message: err.message },
        };
    }
    else if (err instanceof AppError) {
        statusCode = err.statusCode;
        payload = {
            success: false,
            error: { code: err.code, message: err.message, details: err.details },
        };
    }
    else if (err instanceof ZodError) {
        statusCode = 400;
        payload = {
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: 'Validation failed',
                details: err.errors.map((e) => ({
                    field: e.path.join('.'),
                    message: e.message,
                })),
            },
        };
    }
    else if (err instanceof mongoose.Error.ValidationError) {
        statusCode = 400;
        payload = {
            success: false,
            error: {
                code: 'VALIDATION_ERROR',
                message: err.message,
                details: Object.values(err.errors).map((e) => ({
                    field: e.path,
                    message: e.message,
                })),
            },
        };
    }
    else if (err instanceof mongoose.Error.CastError) {
        statusCode = 400;
        payload = {
            success: false,
            error: {
                code: 'INVALID_ID',
                message: `Invalid ${err.path}: ${String(err.value)}`,
            },
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }
    else if (err.code === 11000) {
        statusCode = 409;
        payload = {
            success: false,
            error: {
                code: 'DUPLICATE_KEY',
                message: 'A record with this value already exists',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                details: err.keyValue,
            },
        };
    }
    else if (err instanceof jwt.JsonWebTokenError) {
        statusCode = 401;
        payload = {
            success: false,
            error: { code: 'INVALID_TOKEN', message: err.message },
        };
    }
    // Always attach request ID to the error response for support traceability
    if (req.requestId) {
        payload.error.requestId = req.requestId;
    }
    if (statusCode >= 500) {
        logger.error({ err, requestId: req.requestId, path: req.path }, 'Unhandled error');
        // Forward to Sentry with request context for grouping + triage.
        Sentry.captureException(err, {
            tags: {
                requestId: req.requestId ?? 'unknown',
                path: req.path,
            },
            extra: {
                statusCode,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                userId: req.user?._id ? String(req.user._id) : undefined,
            },
        });
    }
    else {
        logger.warn({ code: payload.error.code, requestId: req.requestId, path: req.path }, payload.error.message);
    }
    // ── Failure trail ──
    // Every refused request lands in the audit log so an admin can see exactly
    // which errors employees are hitting, when, and on what — instead of a
    // support message saying "it showed an error". Fire-and-forget: writing the
    // trail must never turn a 400 into a 500.
    if (statusCode !== 401 || !NOISY_CODES.has(payload.error.code)) {
        void audit({
            action: 'failure',
            entity: 'Request',
            entityId: req.requestId,
            metadata: {
                code: payload.error.code,
                message: payload.error.message,
                status: statusCode,
                method: req.method,
                path: req.originalUrl ?? req.path,
                details: payload.error.details,
            },
        });
    }
    res.status(statusCode).json(payload);
}
//# sourceMappingURL=error.middleware.js.map