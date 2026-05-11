/**
 * Wraps an async route handler so thrown errors are forwarded
 * to Express's error middleware instead of becoming unhandled
 * promise rejections.
 */
export function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
//# sourceMappingURL=async-handler.js.map