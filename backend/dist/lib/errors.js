export class AppError extends Error {
    statusCode;
    code;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details;
    isOperational = true;
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', 
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}
export class ValidationAppError extends AppError {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    constructor(message = 'Validation failed', details) {
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
    constructor(message = 'Forbidden', details) {
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
//# sourceMappingURL=errors.js.map