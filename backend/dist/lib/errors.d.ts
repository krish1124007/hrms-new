export declare class AppError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: any;
    readonly isOperational = true;
    constructor(message: string, statusCode?: number, code?: string, details?: any);
}
export declare class ValidationAppError extends AppError {
    constructor(message?: string, details?: any);
}
export declare class UnauthorizedError extends AppError {
    constructor(message?: string);
}
export declare class ForbiddenError extends AppError {
    constructor(message?: string, details?: any);
}
export declare class NotFoundError extends AppError {
    constructor(message?: string);
}
export declare class ConflictError extends AppError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.d.ts.map