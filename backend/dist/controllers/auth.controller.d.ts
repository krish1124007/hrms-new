import type { Request, Response } from 'express';
export declare function register(req: Request, res: Response): Promise<void>;
export declare function login(req: Request, res: Response): Promise<void>;
export declare function refreshToken(req: Request, res: Response): Promise<void>;
export declare function logout(req: Request, res: Response): Promise<void>;
export declare function logoutAll(req: Request, res: Response): Promise<void>;
export declare function forgotPassword(req: Request, res: Response): Promise<void>;
export declare function resetPassword(req: Request, res: Response): Promise<void>;
export declare function verifyEmail(req: Request, res: Response): Promise<void>;
export declare function me(req: Request, res: Response): Promise<void>;
/**
 * Update the currently logged-in user's own profile (name + avatar).
 * Email and role are intentionally not editable here — those go through
 * admin-only endpoints.
 */
export declare function updateMyProfile(req: Request, res: Response): Promise<void>;
/**
 * Self-service password change. Requires the current password as a sanity
 * check before swapping in the new one — same pattern as `resetPassword` but
 * without the email-token round-trip.
 */
export declare function changeMyPassword(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=auth.controller.d.ts.map