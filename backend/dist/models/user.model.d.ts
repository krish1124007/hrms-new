import { type Document, type Model, type Types } from 'mongoose';
import { type PaginateModel } from '../lib/mongoose-plugins.js';
export type UserStatus = 'active' | 'inactive' | 'invited';
export type LoginMethod = 'email' | 'uid' | 'sso';
export interface IRefreshToken {
    token: string;
    device?: string;
    ip?: string;
    createdAt: Date;
    expiresAt: Date;
}
export interface IUser extends Document {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    avatar?: string;
    role: Types.ObjectId;
    customPermissions: string[];
    status: UserStatus;
    lastLogin?: Date;
    emailVerified: boolean;
    emailVerificationToken?: string;
    passwordResetToken?: string;
    passwordResetExpires?: Date;
    loginMethod: LoginMethod;
    uid?: string;
    refreshTokens: IRefreshToken[];
    passwordHistory: string[];
    passwordChangedAt?: Date;
    sessionVersion: number;
    assetName?: string;
    assetCode?: string;
    category?: string;
    condition?: string;
    consents?: {
        termsOfService: boolean;
        privacyPolicy: boolean;
        marketing?: boolean;
        analytics?: boolean;
        recordedAt: Date;
        ip?: string;
        userAgent?: string;
        documentVersions?: Record<string, string>;
    };
    isDeleted: boolean;
    deletedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
    comparePassword(candidate: string): Promise<boolean>;
    generateAccessToken(): string;
    generateRefreshToken(): string;
}
export declare const User: PaginateModel<IUser> & Model<IUser, {}, {}, {}, Document<unknown, {}, IUser, {}, {}> & IUser & Required<{
    _id: Types.ObjectId;
}> & {
    __v: number;
}, any>;
/**
 * Activates a still-`invited` account in place (status, verified e-mail, spent
 * invitation token) and reports whether it did. For flows that already prove
 * the user may hold the account — a password-reset token sent to their
 * mailbox, an admin setting the password. The caller saves; the document must
 * have been loaded with `+emailVerificationToken` for the token to be cleared.
 */
export declare function activateIfInvited(user: IUser): boolean;
//# sourceMappingURL=user.model.d.ts.map