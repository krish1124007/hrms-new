import { Router } from 'express';
import * as auth from '../controllers/auth.controller.js';
import { authMiddleware } from '../middleware/auth.middleware.js';
import { authRateLimit } from '../middleware/rate-limit.middleware.js';
import { TIGHT_JSON } from '../middleware/body-limit.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { loginSchema, refreshTokenSchema, forgotPasswordSchema, resetPasswordSchema, acceptInviteSchema, changeMyPasswordSchema, updateMyProfileSchema } from '../validators/auth.validators.js';
const router = Router();
// Strict rate limiting on all auth endpoints to prevent brute-force attacks.
// 20 attempts per IP per 15 minutes.
router.use(['/login', '/forgot-password', '/reset-password', '/accept-invite'], authRateLimit);
router.post('/login', TIGHT_JSON, validate(loginSchema), asyncHandler(auth.login));
router.post('/refresh-token', TIGHT_JSON, validate(refreshTokenSchema), asyncHandler(auth.refreshToken));
router.post('/logout', TIGHT_JSON, asyncHandler(auth.logout));
router.post('/logout-all', authMiddleware, asyncHandler(auth.logoutAll));
router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(auth.forgotPassword));
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(auth.resetPassword));
router.post('/accept-invite', TIGHT_JSON, validate(acceptInviteSchema), asyncHandler(auth.acceptInvite));
router.get('/me', authMiddleware, asyncHandler(auth.me));
router.patch('/me', authMiddleware, validate(updateMyProfileSchema), asyncHandler(auth.updateMyProfile));
router.post('/change-password', authMiddleware, validate(changeMyPasswordSchema), asyncHandler(auth.changeMyPassword));
export default router;
//# sourceMappingURL=auth.routes.js.map