import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';
import { TIGHT_JSON } from '../middleware/body-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { registerSchema, loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validators.js';

const router = Router();

// Strict rate limiting on all auth endpoints to prevent brute-force attacks.
// 10 attempts per IP per 15 minutes.
router.use(['/login', '/register', '/forgot-password', '/reset-password'], authRateLimit);

router.post('/register', TIGHT_JSON, validate(registerSchema), asyncHandler(auth.register));
router.post('/login', TIGHT_JSON, validate(loginSchema), asyncHandler(auth.login));
router.post('/refresh-token', TIGHT_JSON, validate(refreshTokenSchema), asyncHandler(auth.refreshToken));
router.post('/logout', TIGHT_JSON, asyncHandler(auth.logout));
router.post('/logout-all', authMiddleware, asyncHandler(auth.logoutAll));
router.post(
  '/forgot-password',
  validate(forgotPasswordSchema),
  asyncHandler(auth.forgotPassword),
);
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(auth.resetPassword));
router.get('/verify-email/:token', asyncHandler(auth.verifyEmail));
router.get('/me', authMiddleware, asyncHandler(auth.me));

export default router;
