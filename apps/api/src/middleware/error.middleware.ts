import type { Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';
import { logger } from '../config/logger.js';
import { AppError } from '../lib/errors.js';
import { CircuitOpenError } from '../lib/circuit-breaker.js';
import { Sentry } from '../lib/sentry.js';

interface ErrorPayload {
  success: false;
  error: {
    code: string;
    message: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any;
    /** Request ID — customers can quote this in support tickets */
    requestId?: string;
  };
}

export function errorMiddleware(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  let statusCode = 500;
  let payload: ErrorPayload = {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  };

  if (err instanceof CircuitOpenError) {
    statusCode = err.statusCode;
    payload = {
      success: false,
      error: { code: err.code, message: err.message },
    };
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    payload = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
  } else if (err instanceof ZodError) {
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
  } else if (err instanceof mongoose.Error.ValidationError) {
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
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    payload = {
      success: false,
      error: {
        code: 'INVALID_ID',
        message: `Invalid ${err.path}: ${String(err.value)}`,
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } else if ((err as any).code === 11000) {
    statusCode = 409;
    payload = {
      success: false,
      error: {
        code: 'DUPLICATE_KEY',
        message: 'A record with this value already exists',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        details: (err as any).keyValue,
      },
    };
  } else if (err instanceof jwt.JsonWebTokenError) {
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
        userId: (req as any).user?._id ? String((req as any).user._id) : undefined,
      },
    });
  } else {
    logger.warn(
      { code: payload.error.code, requestId: req.requestId, path: req.path },
      payload.error.message,
    );
  }

  res.status(statusCode).json(payload);
}
