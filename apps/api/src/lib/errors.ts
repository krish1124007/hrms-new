export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly details?: any;
  public readonly isOperational = true;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details?: any,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationAppError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message = 'Validation failed', details?: any) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(message = 'Forbidden', details?: any) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}
